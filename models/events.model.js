const client = require("../database/connection");
const jwt = require("jsonwebtoken");
const {checkIfExists, checkUserCanAccessEvent} = require("./utils.model");

exports.selectEvents = async (queries, headers) => {
    const token = headers["authorization"];
    // If a token is provided, include events the user would have access to
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.user_id;
            const results = await client.query(`SELECT e.*
                                                FROM events e
                                                         LEFT JOIN groups g ON e.group_id = g.id
                                                         LEFT JOIN user_groups ug ON ug.group_id = g.id AND ug.user_id = $1
                                                WHERE (
                                                          (e.visibility = 0 AND g.visibility = 0)
                                                              OR
                                                          (ug.user_id = $1 AND e.visibility <= ug.access_level)
                                                          );`, [user_id]);
            return results.rows;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    } else {
        // Otherwise just return public events
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

exports.selectEvent = async (params, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    await eventChecklist(eventId, token);

    // Select the event
    const eventResult = await client.query(`SELECT *
                                            FROM events
                                            WHERE id = $1`, [eventId]);
    const event = eventResult.rows[0];
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [event.group_id]);
    event.group = groupResult.rows[0];
    return event;
};

exports.insertEvent = async (body, headers) => {
    const token = headers["authorization"];
    if (token)
        try {
            // Verify user from JWT token
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.user_id;

            // Insert event into the database
            const query = `
                INSERT INTO events (group_id, created_by, visibility, start_time, title, description)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *;
            `;
            const values = [
                body.group_id,
                userId,
                body.visibility || 0,
                body.start_time,
                body.title,
                body.description
            ];

            const res = await client.query(query, values);
            return res.rows[0];
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    else
        return Promise.reject({status: 401, msg: "Unauthorised"});
};

exports.updateEvent = async (params, body, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);

    // Ensure the user is the creator of the event
    const checkQuery = `
        SELECT created_by
        FROM events
        WHERE id = $1;
    `;
    const checkRes = await client.query(checkQuery, [eventId]);
    if (checkRes.rows[0].created_by !== userId) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Update event in the database
    const updateQuery = `
        UPDATE events
        SET visibility  = $1,
            start_time  = $2,
            title       = $3,
            description = $4
        WHERE id = $5
        RETURNING *;
    `;
    const values = [
        body.visibility,
        body.start_time,
        body.title,
        body.description,
        eventId
    ];

    const res = await client.query(updateQuery, values);
    return res.rows[0];
};

exports.deleteEvent = async (params, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);
    if (userId === undefined) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Ensure the user is the creator of the event
    const checkQuery = `
        SELECT created_by
        FROM events
        WHERE id = $1;
    `;
    const checkRes = await client.query(checkQuery, [eventId]);
    if (checkRes.rows[0].created_by !== userId) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
    // Delete event from the database
    await client.query(`
        DELETE
        FROM events
        WHERE id = $1;
    `, [eventId]);
};

exports.selectEventComments = async (params, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    await eventChecklist(eventId, token);

    // Select comments for the event
    const query = `
        SELECT c.id, c.event_id, c.user_id, c.comment, c.time_submitted, u.username
        FROM comments c
                 JOIN users u ON c.user_id = u.id
        WHERE c.event_id = $1
        ORDER BY c.time_submitted;
    `;
    const res = await client.query(query, [eventId]);
    return res.rows;
};

exports.insertEventComment = async (params, body, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);

    // Insert comment into the database
    const query = `
        INSERT INTO comments (event_id, user_id, comment)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;

    const res = await client.query(query, [eventId, userId, body.comment]);
    return res.rows[0];
};

exports.deleteEventComment = async (params, headers) => {
    const commentId = params.comment_id;
    const eventId = params.event_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);

    // Verify the user is either the event creator or the comment writer
    const checkQuery = `
        SELECT c.user_id, e.created_by
        FROM comments c
                 JOIN events e ON c.event_id = e.id
        WHERE c.id = $1;
    `;
    const checkRes = await client.query(checkQuery, [commentId]);
    if (checkRes.rows.length === 0) {
        return Promise.reject({status: 404, msg: "Comment Not Found"});
    }
    const comment = checkRes.rows[0];
    if (comment.user_id !== userId && comment.created_by !== userId) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Delete comment from the database
    const deleteQuery = `
        DELETE
        FROM comments
        WHERE id = $1
        RETURNING *;
    `;
    const res = await client.query(deleteQuery, [commentId]);
    return res.rows[0];
};

exports.selectEventUsers = async (params, headers) => {
    const eventId = params.event_id;
    const token = headers["authorization"];
    await eventChecklist(eventId, token);

    // Select users for the event
    const query = `
        SELECT u.username, u.display_name, u.avatar, eu.status
        FROM event_users eu
                 JOIN users u ON eu.user_id = u.id
        WHERE eu.event_id = $1;
    `;
    const res = await client.query(query, [eventId]);
    return res.rows;
};

exports.insertEventUser = async (params, body, headers) => {
    const eventId = params.event_id;
    const userIdToInsert = body.user_id;
    const token = headers["authorization"];
    await eventChecklist(eventId, token);

    // Check if invited user has permission to see the event
    await checkUserCanAccessEvent(eventId, userIdToInsert);

    // Insert user into the event
    const query = `
        INSERT INTO event_users (event_id, user_id, status)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;
    const values = [eventId, userIdToInsert, body.status || 0];

    const res = await client.query(query, values);
    return res.rows[0];
};

exports.updateEventUser = async (params, headers) => {
    const eventId = params.event_id;
    const userIdToUpdate = params.user_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);

    // Get event and user associated with event_user record
    const selectQuery = `
        SELECT eu.event_id, eu.user_id, e.created_by
        FROM event_users eu
                 JOIN events e ON eu.event_id = e.id
        WHERE eu.event_id = $1
          and eu.user_id = $2;
    `;
    const selectRes = await client.query(selectQuery, [eventId, userId]);
    if (selectRes.rows.length === 0) {
        return Promise.reject({status: 404, msg: "Not Found"});
    }
    const eventUser = selectRes.rows[0];

    // Check if requesting user has permission to update this event user
    const hasPermission = eventUser.created_by === userId || eventUser.user_id === userIdToUpdate;
    if (!hasPermission) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Update status of the event user
    const updateQuery = `
        UPDATE event_users
        SET status = $1
        WHERE id = $2
        RETURNING *;
    `;
    const values = [params.status, eventUser.id];

    const res = await client.query(updateQuery, values);
    return res.rows[0];
};

exports.deleteEventUser = async (params, headers) => {
    const eventId = params.event_id;
    const userIdToDelete = params.user_id;
    const token = headers["authorization"];
    const userId = await eventChecklist(eventId, token);

    // Get event and user associated with event_user record
    const selectQuery = `
        SELECT eu.event_id, eu.user_id, e.created_by
        FROM event_users eu
                 JOIN events e ON eu.event_id = e.id
        WHERE eu.event_id = $1
          and eu.user_id = $2;
    `;
    const selectRes = await client.query(selectQuery, [eventId, userIdToDelete]);
    if (selectRes.rows.length === 0) {
        return Promise.reject({status: 404, msg: "Not Found"});
    }
    const eventUser = selectRes.rows[0];

    // Check if requesting user has permission to delete this event user
    const hasPermission = eventUser.created_by === userId || eventUser.user_id === userId;
    if (!hasPermission) {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }

    // Delete the event user
    const deleteQuery = `
        DELETE
        FROM event_users
        WHERE id = $1
        RETURNING *;
    `;
    await client.query(deleteQuery, [eventUser.id]);
};

const checkEventIsPublic = async (eventId) => {
    const query = `
        SELECT e.id,
               e.created_by,
               e.visibility,
               e.group_id,
               g.visibility as group_visibility
        FROM events e
                 LEFT JOIN public.groups g on g.id = e.group_id
        WHERE e.id = $1;
    `;
    const res = await client.query(query, [eventId]);
    // If event and group are public, return true
    if (res.rows[0].visibility === 0 && res.rows[0].group_visibility === 0) {
        return true;
    }
    // If this has failed, reject the request
    return Promise.reject({status: 401, msg: "Unauthorised"});
};

const eventChecklist = async (eventId, token) => {
    let userId = undefined;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            userId = decoded.user_id;
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    }
    if (!eventId) {
        return Promise.reject({status: 400, msg: "Event ID not provided"});
    }
    if (Number.isNaN(eventId)) {
        return Promise.reject({status: 400, msg: "Invalid event_id datatype"});
    }
    if (!(await checkIfExists("events", "id", +eventId))) {
        return Promise.reject({status: 404, msg: "Event not found"});
    }
    if (userId) {
        await checkUserCanAccessEvent(eventId, userId);
    } else {
        await checkEventIsPublic(eventId);
    }
    return userId;
};