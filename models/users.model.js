const client = require("../database/connection");
const jwt = require("jsonwebtoken");
const {checkIfExists, generateUserToken} = require("./utils.model");
const {hash} = require("bcrypt");

const saltRounds = 10;

exports.selectUsers = async (queries, headers) => {
    const {username, displayName} = queries;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userResult = await client.query(`SELECT username, display_name, avatar, about
                                                   FROM users`, []);
            return userResult.rows;
        } catch {
            const userResult = await client.query(`SELECT username, display_name, avatar, about
                                                   FROM users`, []);
            return userResult.rows;
        }
    } else {
        const userResult = await client.query(`SELECT username, display_name, avatar, about
                                               FROM users`, []);
        return userResult.rows;
    }
};

exports.selectUser = async (params, headers) => {
    const {username} = params;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (!(await checkIfExists("users", "username", username))) {
        return Promise.reject({status: 404, msg: "User Not Found"});
    }
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            if (username === decoded.username) {
                const userResult = await client.query(`SELECT *
                                                       FROM users
                                                       WHERE username = $1`, [username]);
                return userResult.rows[0];
            } else {
                const userResult = await client.query(`SELECT id,
                                                              username,
                                                              display_name,
                                                              avatar,
                                                              about
                                                       FROM users
                                                       WHERE username = $1`, [username]);
                const user = userResult.rows[0];
                const contactResult = await client.query(`SELECT uc.note,
                                                                 (case
                                                                      when uc.user_id = uc2.contact_id AND uc.contact_id = uc2.user_id
                                                                          THEN TRUE
                                                                      ELSE FALSE END) as friends
                                                          FROM user_contacts as uc
                                                                   LEFT JOIN user_contacts uc2 on uc2.user_id = $2 AND uc2.contact_id = $1
                                                          WHERE uc.user_id = $1
                                                            AND uc.contact_id = $2`, [decoded.id, user.id]);
                if (contactResult.rows.length > 0) {
                    user.contact = contactResult.rows[0];
                }
                return user;
            }
        } catch {
            const userResult = await client.query(`SELECT username, display_name, avatar, about
                                                   FROM users
                                                   WHERE username = $1`, [username]);
            return userResult.rows[0];
        }
    } else {
        const userResult = await client.query(`SELECT username, display_name, avatar, about
                                               FROM users
                                               WHERE username = $1`, [username]);
        return userResult.rows[0];
    }
};

exports.insertUser = async (body, headers) => {
    try {
        // Check if username or email already exist
        const userExistsQuery = "SELECT * FROM users WHERE username = $1 OR email = $2";
        const userExistsResult = await client.query(userExistsQuery, [body.username, body.email]);

        if (userExistsResult.rows && userExistsResult.rows.length > 0) {
            return Promise.reject({status: 409, msg: "Username or email already exist."});
        }

        // Hash the password
        const hashedPassword = await hash(body.password, saltRounds);

        // Insert new user
        const insertUserQuery = "INSERT INTO users (username, display_name, email, password) VALUES ($1, $2, $3, $4) RETURNING id, username, display_name";
        const insertUserResult = await client.query(insertUserQuery, [body.username, body.display_name, body.email, hashedPassword]);

        // Return inserted user
        return generateUserToken(insertUserResult.rows[0]);
    } catch (err) {
        return Promise.reject({status: 500, msg: err.message});
    }
};

exports.updateUser = async (params, body, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const username = decoded.username;

            // Ensure the user is modifying their own account
            if (params.username !== username) {
                return Promise.reject({status: 401, msg: "Unauthorised"});
            }

            // Update event in the database
            const updateQuery = `
                UPDATE users
                SET display_name = $1,
                    email        = $2,
                    about        = $3
                WHERE username = $4
                RETURNING *;
            `;
            const values = [
                body.display_name,
                body.email,
                body.about,
                username
            ];

            const res = await client.query(updateQuery, values);

            // Handle a new password
            if (body.password) {
                const hashedPassword = await hash(body.password, saltRounds);
                const updatePasswordQuery = `
                    UPDATE users
                    SET password = $1
                    WHERE username = $2
                    RETURNING *;
                `;
                const passwordValues = [
                    hashedPassword,
                    username
                ];
                await client.query(updatePasswordQuery, passwordValues);
            }

            return res.rows[0];
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

exports.deleteUser = async (params, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const username = decoded.username;

            // Ensure the user is deleting their own account
            if (params.username !== username) {
                return Promise.reject({status: 401, msg: "Unauthorised"});
            }
            // Delete user from the database
            await client.query(`
                DELETE
                FROM users
                WHERE username = $1;
            `, [username]);
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

exports.selectUserGroups = async (params, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.id;
            const results = await client.query(`SELECT g.*
                                                FROM groups g
                                                         INNER JOIN user_groups ug1 ON ug1.group_id = g.id
                                                         INNER JOIN users u1 ON ug1.user_id = u1.id AND u1.username = $1
                                                         LEFT JOIN user_groups ug2 ON ug2.group_id = g.id AND ug2.user_id = $2
                                                WHERE (
                                                          (g.visibility = 0)
                                                              OR
                                                          (ug2.user_id = $2)
                                                          );`, [params.username, user_id]);
            return results.rows;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        const results = await client.query(`SELECT g.*
                                            FROM groups g
                                                     INNER JOIN user_groups ug1 ON ug1.group_id = g.id
                                                     INNER JOIN users u1 ON ug1.user_id = u1.id = $1
                                            WHERE (
                                                      (g.visibility = 0)
                                                      );`, [params.username]);
        return results.rows;
    }
};

exports.updateUserNote = async (params, body, headers) => {
    const tokenHeader = headers["authorization"];
    const {username} = params;
    const {note} = body;
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.id;
            const userToUpdateResult = await client.query(`SELECT id,
                                                                  username,
                                                                  display_name,
                                                                  avatar,
                                                                  about
                                                           FROM users
                                                           WHERE username = $1;`, [username]);
            if (userToUpdateResult.rows.length === 0) {
                return Promise.reject({status: 404, msg: "User Not Found"});
            }
            const user = userToUpdateResult.rows[0];
            await client.query(`INSERT INTO user_contacts (user_id, contact_id, note)
                                VALUES ($1, $2, $3)
                                ON CONFLICT (user_id, contact_id)
                                    DO UPDATE SET note = $3`, [userId, user.id, note]);
            const contactResult = await client.query(`SELECT uc.note,
                                                             (case
                                                                  when uc.user_id = uc2.contact_id AND uc.contact_id = uc2.user_id
                                                                      THEN TRUE
                                                                  ELSE FALSE END) as friends
                                                      FROM user_contacts as uc
                                                               LEFT JOIN user_contacts uc2 on uc2.user_id = $2 AND uc2.contact_id = $1
                                                      WHERE uc.user_id = $1
                                                        AND uc.contact_id = $2`, [decoded.id, user.id]);
            user.contact = contactResult.rows[0];
            return user;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

exports.insertUserFollow = async (params, headers) => {
    const tokenHeader = headers["authorization"];
    const {username} = params;
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.id;
            const userResult = await client.query(`SELECT id,
                                                          username,
                                                          display_name,
                                                          avatar,
                                                          about
                                                   FROM users
                                                   WHERE username = $1`, [username]);
            if (userResult.rows.length === 0) {
                return Promise.reject({status: 404, msg: "User Not Found"});
            }
            const user = userResult.rows[0];
            await client.query(`INSERT INTO user_contacts (user_id, contact_id)
                                VALUES ($1, $2)
                                ON CONFLICT (user_id, contact_id)
                                    DO NOTHING`, [userId, user.id]);
            const contactResult = await client.query(`SELECT uc.note,
                                                             (case
                                                                  when uc.user_id = uc2.contact_id AND uc.contact_id = uc2.user_id
                                                                      THEN TRUE
                                                                  ELSE FALSE END) as friends
                                                      FROM user_contacts as uc
                                                               LEFT JOIN user_contacts uc2 on uc2.user_id = $2 AND uc2.contact_id = $1
                                                      WHERE uc.user_id = $1
                                                        AND uc.contact_id = $2`, [decoded.id, user.id]);
            if (contactResult.rows.length > 0) {
                user.contact = contactResult.rows[0];
            }
            return user;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised: Invalid Authentication"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised: No Authentication Provided"});
    }
};

exports.deleteUserFollow = async (params, headers) => {
    const tokenHeader = headers["authorization"];
    const {username} = params;
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.id;
            const userResult = await client.query(`SELECT id,
                                                          username,
                                                          display_name,
                                                          avatar,
                                                          about
                                                   FROM users
                                                   WHERE username = $1`, [username]);
            if (userResult.rows.length === 0) {
                return Promise.reject({status: 404, msg: "User Not Found"});
            }
            const user = userResult.rows[0];
            await client.query(`DELETE
                                FROM user_contacts
                                WHERE user_id = $1
                                  AND contact_id = $2`, [userId, user.id]);
            return user;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};