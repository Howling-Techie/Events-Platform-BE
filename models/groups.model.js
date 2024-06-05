const jwt = require("jsonwebtoken");
const client = require("../database/connection");
const {checkIfExists, checkUserCanAccessGroup} = require("./utils.model");

exports.selectGroups = async (queries, headers) => {
    const token = headers["authorization"];
    // If a token is provided, return groups the user would have access to
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.user_id;
            const results = await client.query(`SELECT g.*
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
    const token = headers["authorization"];
    await groupChecklist(groupId, token);

    // Select the group
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [groupId]);
    return groupResult.rows[0];
};

exports.insertGroup = async (body, headers) => {
    const token = headers["authorization"];
    if (token)
        try {
            // Verify user from JWT token
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.user_id;

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
            return res.rows[0];
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    else
        return Promise.reject({status: 401, msg: "Unauthorised"});
};

exports.updateGroup = async (params, body, headers) => {
    const groupId = params.group_id;
    const token = headers["authorization"];
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
    const token = headers["authorization"];
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

exports.selectGroupUsers = async (params, headers) => {
    const groupId = params.group_id;
    const token = headers["authorization"];
    await groupChecklist(groupId, token);

    // Select users for the group
    const query = `
        SELECT u.username, u.display_name, u.avatar, ug.access_level
        FROM user_groups ug
                 JOIN users u ON ug.user_id = u.id
        WHERE ug.group_id = $1;
    `;
    const res = await client.query(query, [groupId]);
    return res.rows;
};

exports.selectGroupEvents = async (params, headers) => {
    const groupId = params.group_id;
    const token = headers["authorization"];
    const userId = await groupChecklist(groupId, token);
    
    // Get all visible events
    if (userId) {
        const eventResults = await client.query(`SELECT e.*
                                                 FROM events e
                                                          INNER JOIN groups g on e.group_id = g.id AND g.id = $2
                                                          INNER JOIN user_groups ug on g.id = ug.group_id AND ug.user_id = $1
                                                 WHERE e.visibility <= ug.access_level`, [userId, groupId]);
        return eventResults.rows;
    }
    // Otherwise just get the public events
    const eventResults = await client.query(`SELECT e.*
                                             FROM events e
                                                      INNER JOIN groups g on e.group_id = g.id AND g.id = $1
                                             WHERE g.visibility = 0`, [groupId]);
    return eventResults.rows;
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
            userId = decoded.user_id;
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