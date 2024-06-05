const client = require("../database/connection");
const jwt = require("jsonwebtoken");
const {checkIfExists, generateUserToken} = require("./utils.model");
const {hash} = require("bcrypt");
exports.selectUsers = async (queries, headers) => {

};

exports.selectUser = async (params, headers) => {
    const {username} = params;
    const token = headers["authorization"];
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
                const userResult = await client.query(`SELECT username, display_name, avatar, about
                                                       FROM users
                                                       WHERE username = $1`, [username]);
                return userResult.rows[0];
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
    const saltRounds = 10;
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
    const token = headers["authorization"];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.user_id;

            // Ensure the user is modifying their own account
            if (params.user_id !== userId) {
                return Promise.reject({status: 401, msg: "Unauthorised"});
            }

            // Update event in the database
            const updateQuery = `
                UPDATE users
                SET display_name = $1,
                    email        = $2
                WHERE id = $3
                RETURNING *;
            `;
            const values = [
                body.display_name,
                body.email,
                userId
            ];

            const res = await client.query(updateQuery, values);
            return res.rows[0];
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

exports.deleteUser = async (params, headers) => {
    const token = headers["authorization"];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.user_id;

            // Ensure the user is deleting their own account
            if (params.user_id !== userId) {
                return Promise.reject({status: 401, msg: "Unauthorised"});
            }
            // Delete user from the database
            await client.query(`
                DELETE
                FROM users
                WHERE id = $1;
            `, [userId]);
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

exports.selectUserGroups = async (params, headers) => {
    const token = headers["authorization"];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.user_id;
            const results = await client.query(`SELECT e.*
                                                FROM events e
                                                         LEFT JOIN groups g ON e.group_id = g.id
                                                         INNER JOIN user_groups ug1 ON ug1.group_id = g.id AND ug1.user_id = $1
                                                         LEFT JOIN user_groups ug2 ON ug2.group_id = g.id AND ug2.user_id = $2
                                                WHERE (
                                                          (e.visibility = 0 AND g.visibility = 0)
                                                              OR
                                                          (ug2.user_id = $1 AND e.visibility <= ug2.access_level)
                                                          );`, [params.user_id]);
            return results.rows;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        const eventResults = await client.query(`SELECT e.*
                                                 FROM events e
                                                          LEFT JOIN groups g ON e.group_id = g.id
                                                 WHERE e.visibility = 0
                                                   AND g.visibility = 0`);
        const events = eventResults.rows;
        for (const event of events) {
            const groupResult = await client.query(`SELECT *
                                                    FROM groups
                                                    WHERE id = $1`, [event.group_id]);
            event.group = groupResult.rows[0];
        }
        return events;
    }
};