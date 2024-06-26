const jwt = require("jsonwebtoken");
const client = require("../database/connection");
const {checkIfExists, checkUserCanAccessGroup} = require("./utils.model");

exports.selectGroups = async (queries, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    // If a token is provided, return groups the user would have access to
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.id;
            const results = await client.query(`SELECT g.*, ug.access_level as user_access_level
                                                FROM groups g
                                                         LEFT JOIN user_groups ug ON ug.group_id = g.id AND ug.user_id = $1
                                                WHERE (
                                                          (g.visibility = 0)
                                                              OR
                                                          (ug.user_id = $1 AND g.visibility <= ug.access_level)
                                                          );`, [user_id]);
            return results.rows;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        // Otherwise just return public groups
        const results = await client.query(`SELECT g.*
                                            FROM groups g
                                            WHERE g.visibility = 0`);
        return results.rows;
    }
};

exports.selectGroup = async (params, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);

    // Select the group
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [groupId]);
    const group = groupResult.rows[0];
    // Select the group owner
    const ownerResult = await client.query(`SELECT id, username, display_name, about
                                            FROM users
                                            WHERE id = $1`, [group.owner_id]);
    group.owner = ownerResult.rows[0];

    // Check if user is in group
    if (userId) {
        const userInGroupResult = await client.query(`SELECT access_level
                                                      FROM user_groups
                                                      WHERE user_id = $1
                                                        AND group_id = $2`, [userId, groupId]);
        if (userInGroupResult.rows.length > 0) {
            group.user_access_level = userInGroupResult.rows[0].access_level;
        }
    }
    return group;
};

exports.insertGroup = async (body, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token)
        try {
            // Verify user from JWT token
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.id;

            // Insert group into the database
            const query = `
                INSERT INTO groups (owner_id, name, visibility, about)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;
            const values = [
                userId,
                body.name,
                body.visibility || 0,
                body.about
            ];
            const res = await client.query(query, values);
            const group = res.rows[0];
            // Add owner to list of users in group
            await client.query(`INSERT INTO user_groups(user_id, group_id, access_level)
                                VALUES ($1, $2, 3)`, [userId, group.id]);
            return group;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    else
        return Promise.reject({status: 401, msg: "Unauthorised"});
};

exports.updateGroup = async (params, body, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);

    // Ensure the user is the creator of the group
    const checkQuery = `
        SELECT owner_id
        FROM groups
        WHERE id = $1;
    `;
    const checkRes = await client.query(checkQuery, [groupId]);
    if (checkRes.rows[0].owner_id !== userId) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Update group in the database
    const updateQuery = `
        UPDATE groups
        SET visibility = $1,
            name       = $2,
            about      = $3
        WHERE id = $4
        RETURNING *;
    `;
    const values = [
        body.visibility,
        body.name,
        body.about,
        groupId
    ];

    const res = await client.query(updateQuery, values);
    return res.rows[0];
};

exports.deleteGroup = async (params, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);
    if (userId === undefined) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Ensure the user is the creator of the group
    const checkQuery = `
        SELECT owner_id
        FROM groups
        WHERE id = $1;
    `;
    const checkRes = await client.query(checkQuery, [groupId]);
    if (checkRes.rows[0].owner_id !== userId) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
    // Delete group from the database
    await client.query(`
        DELETE
        FROM groups
        WHERE id = $1;
    `, [groupId]);
};

exports.selectGroupUsers = async (params, queries, headers) => {
    const {search} = queries;
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await groupChecklist(groupId, token);

    // Select users for the group
    let users;
    if (search) {
        const query = `
            SELECT u.id, u.username, u.display_name, u.avatar, ug.access_level
            FROM user_groups ug
                     JOIN users u ON ug.user_id = u.id
            WHERE ug.group_id = $1
              AND (u.username ILIKE $2
                OR u.display_name ILIKE $2);`;

        const res = await client.query(query, [groupId, `%${search}%`]);
        users = res.rows;
        console.log(groupId);
    } else {
        const query = `
            SELECT u.id, u.username, u.display_name, u.avatar, ug.access_level
            FROM user_groups ug
                     JOIN users u ON ug.user_id = u.id
            WHERE ug.group_id = $1;
        `;
        const res = await client.query(query, [groupId]);
        users = res.rows;
    }
    return users.map(r => {
        return {
            user: {id: r.id, username: r.username, display_name: r.display_name, avatar: r.avatar},
            user_access_level: r.access_level
        };
    });
};

exports.updateGroupUser = async (params, body, headers) => {
    const {group_id, user_id} = params;
    const {status} = body;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await groupChecklist(group_id, token);

    // Update user_groups info
    const updateResult = await client.query(`
        UPDATE user_groups
        SET access_level = $1
        WHERE group_id = $2
          AND user_id = $3
        RETURNING *;
    `, [status, group_id, user_id]);
    return updateResult.rows[0];
};

exports.insertGroupUser = async (params, body, headers) => {
    const {group_id, user_id} = params;
    const {status} = body;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await groupChecklist(group_id, token);

    // Update user_groups info
    const updateResult = await client.query(`
        INSERT INTO user_groups (user_id, group_id, access_level)
        VALUES ($3, $2, $1)
        ON CONFLICT (user_id, group_id) DO NOTHING
        RETURNING *;
    `, [status, group_id, user_id]);
    return updateResult.rows[0];
};

exports.deleteGroupUser = async (params, headers) => {
    const {group_id, user_id} = params;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await groupChecklist(group_id, token);

    // Delete user_groups user from table
    await client.query(`
        DELETE
        FROM user_groups
        WHERE user_id = $1
          AND group_id = $2;
    `, [user_id, group_id]);
};

exports.selectGroupEvents = async (params, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);

    // Select the group
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [groupId]);
    const group = groupResult.rows[0];
    // Get all visible events
    if (userId) {
        const eventResults = await client.query(`SELECT e.*
                                                 FROM events e
                                                          INNER JOIN groups g on e.group_id = g.id AND g.id = $2
                                                          INNER JOIN user_groups ug on g.id = ug.group_id AND ug.user_id = $1
                                                 WHERE e.visibility <= ug.access_level`, [userId, groupId]);
        return eventResults.rows.map(event => {
            event.group = group;
            return event;
        });
    }
    // Otherwise just get the public events
    const eventResults = await client.query(`SELECT e.*
                                             FROM events e
                                                      INNER JOIN groups g on e.group_id = g.id AND g.id = $1
                                             WHERE g.visibility = 0`, [groupId]);
    return eventResults.rows.map(event => {
        event.group = group;
        return event;
    });
};

exports.deleteGroupJoin = async (params, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    console.log(groupId);
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);
    // Select the group
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [groupId]);
    const group = groupResult.rows[0];

    await client.query(`DELETE
                        FROM user_groups
                        WHERE user_id = $1
                          AND group_id = $2`, [userId, groupId]);

    // Select the group owner
    const ownerResult = await client.query(`SELECT id, username, display_name, about
                                            FROM users
                                            WHERE id = $1`, [group.owner_id]);
    group.owner = ownerResult.rows[0];
    const userInGroupResult = await client.query(`SELECT access_level
                                                  FROM user_groups
                                                  WHERE user_id = $1
                                                    AND group_id = $2`, [userId, groupId]);
    if (userInGroupResult.rows.length > 0) {
        group.user_access_level = userInGroupResult.rows[0].access_level;
    }
    return group;
};

exports.insertGroupJoin = async (params, headers) => {
    const groupId = params.group_id;
    const tokenHeader = headers["authorization"];
    console.log(tokenHeader);
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await groupChecklist(groupId, token);

    // Select the group
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [groupId]);
    const group = groupResult.rows[0];

    // Visibility 0 means public and are instantly approved (access_level 1)
    // Visibility 1 means the user must be approved (access_level 0)
    await client.query(`INSERT INTO user_groups (user_id, group_id, access_level)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (user_id, group_id)
                            DO NOTHING`, [userId, groupId, group.visibility === 0 ? 1 : 0]);

    // Select the group owner
    const ownerResult = await client.query(`SELECT id, username, display_name, about
                                            FROM users
                                            WHERE id = $1`, [group.owner_id]);
    group.owner = ownerResult.rows[0];
    const userInGroupResult = await client.query(`SELECT access_level
                                                  FROM user_groups
                                                  WHERE user_id = $1
                                                    AND group_id = $2`, [userId, groupId]);
    if (userInGroupResult.rows.length > 0) {
        group.user_access_level = userInGroupResult.rows[0].access_level;
    }
    return group;
};

const checkGroupIsPublic = async (groupId) => {
    const query = `
        SELECT g.id,
               g.owner_id,
               g.visibility
        FROM groups g
        WHERE g.id = $1;
    `;
    const res = await client.query(query, [groupId]);
    // If group is public, return true
    if (res.rows[0].visibility === 0) {
        return true;
    }
    // If this has failed, reject the request
    return Promise.reject({status: 401, msg: "Unauthorised"});
};

const groupChecklist = async (groupId, token) => {
    let userId = undefined;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            userId = decoded.id;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    }
    if (!groupId) {
        return Promise.reject({status: 400, msg: "Group ID not provided"});
    }
    if (Number.isNaN(groupId)) {
        return Promise.reject({status: 400, msg: "Invalid group_id datatype"});
    }
    if (!(await checkIfExists("groups", "id", +groupId))) {
        return Promise.reject({status: 404, msg: "Group not found"});
    }
    if (userId) {
        await checkUserCanAccessGroup(groupId, userId);
    } else {
        await checkGroupIsPublic(groupId);
    }
    return userId;
};