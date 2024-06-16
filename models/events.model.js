const client = require("../database/connection");
const jwt = require("jsonwebtoken");
const {checkIfExists, checkUserCanAccessEvent} = require("./utils.model");
const {GoogleAuth} = require("google-auth-library");
const {google} = require("googleapis");

exports.selectEvents = async (queries, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    // If a token is provided, include events the user would have access to
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const user_id = decoded.id;
            const results = await client.query(`SELECT e.*
                                                FROM events e
                                                         LEFT JOIN groups g ON e.group_id = g.id
                                                         LEFT JOIN user_groups ug ON ug.group_id = g.id AND ug.user_id = $1
                                                WHERE (
                                                          (e.visibility = 0 AND g.visibility = 0)
                                                              OR
                                                          (ug.user_id = $1 AND e.visibility <= ug.access_level)
                                                              OR
                                                          (g.owner_id = $1)
                                                          );`, [user_id]);
            const events = results.rows;
            for (const event of events) {
                const groupResult = await client.query(`SELECT *
                                                        FROM groups
                                                        WHERE id = $1`, [event.group_id]);
                const userInEventResult = await client.query(`SELECT status, paid, amount_paid
                                                              FROM event_users
                                                              WHERE user_id = $1
                                                                AND event_id = $2`, [user_id, event.id]);
                if (userInEventResult.rows.length > 0) {
                    event.status = userInEventResult.rows[0];
                }
                event.group = groupResult.rows[0];
            }
            return events;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await eventChecklist(eventId, token);

    // Select the event
    const eventResult = await client.query(`SELECT *
                                            FROM events
                                            WHERE id = $1`, [eventId]);
    const event = eventResult.rows[0];
    // Get Group info
    const groupResult = await client.query(`SELECT *
                                            FROM groups
                                            WHERE id = $1`, [event.group_id]);
    event.group = groupResult.rows[0];
    // Get Creator info
    const creatorResult = await client.query(`SELECT id, username, display_name, avatar, about
                                              FROM users
                                              WHERE id = $1`, [event.created_by]);
    // Get user status
    if (userId) {
        const userInEventResult = await client.query(`SELECT status, paid, amount_paid
                                                      FROM event_users
                                                      WHERE user_id = $1
                                                        AND event_id = $2`, [userId, eventId]);
        if (userInEventResult.rows.length > 0) {
            event.status = userInEventResult.rows[0];
        }
    }

    event.creator = creatorResult.rows[0];
    return event;
};

exports.insertEvent = async (body, headers) => {
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    if (token)
        try {
            // Verify user from JWT token
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            const userId = decoded.id;

            // Check for required fields
            const {
                group_id,
                start_time,
                title,
                description = "",
                location = "",
                visibility = 0,
                price = 0,
                pay_what_you_want = false
            } = body;
            if (!group_id) {
                return Promise.reject({status: 400, msg: "group_id is required"});
            }
            if (!start_time) {
                return Promise.reject({status: 400, msg: "start_time is required"});
            }
            if (!title) {
                return Promise.reject({status: 400, msg: "title is required"});
            }

            // Generate google cal event
            console.log("genning google event");
            const googleCalEvent = await generateGoogleCalEvent({
                group_id,
                location,
                visibility,
                start_time,
                title,
                description
            });
            // Insert event into the database
            const query = `
                INSERT INTO events (group_id, created_by, visibility, start_time, title, description, location,
                                    google_link, price, pay_what_you_want)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;
            const values = [
                group_id,
                userId,
                visibility,
                start_time,
                title,
                description,
                location,
                googleCalEvent.htmlLink,
                price,
                pay_what_you_want
            ];

            const res = await client.query(query, values);

            await client.query(`INSERT INTO event_users (event_id, user_id, status)
                                VALUES ($1, $2, 3);`, [res.rows[0].id, userId]);

            return res.rows[0];
        } catch {
            return Promise.reject({status: 401, msg: "Unauthorised"});
        }
    else
        return Promise.reject({status: 401, msg: "Unauthorised"});
};

exports.updateEvent = async (params, body, headers) => {
    const eventId = params.event_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
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
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await eventChecklist(eventId, token);

    // Select users for the event
    const query = `
        SELECT u.id, u.username, u.display_name, u.avatar, eu.status, eu.amount_paid, eu.paid
        FROM event_users eu
                 JOIN users u ON eu.user_id = u.id
        WHERE eu.event_id = $1;
    `;
    const res = await client.query(query, [eventId]);
    const users = res.rows;
    return users.map(r => {
        return {
            user: {id: r.id, username: r.username, display_name: r.display_name, avatar: r.avatar},
            status: {status: r.status, paid: r.paid, amount_paid: r.amount_paid}
        };
    });
};

exports.insertEventUser = async (params, body, headers) => {
    const eventId = params.event_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await eventChecklist(eventId, token);
    const userIdToInsert = params.user_id ?? userId;

    // Check if invited user has permission to see the event
    await checkUserCanAccessEvent(eventId, userIdToInsert);

    // Insert user into the event
    const query = `
        INSERT INTO event_users (event_id, user_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id, user_id)
            DO NOTHING
        RETURNING *;
    `;
    const values = [eventId, userIdToInsert, userId ? (body.status || 0) : 0];

    const res = await client.query(query, values);
    return res.rows[0];
};

exports.updateEventPayment = async (params, body, headers) => {
    const {event_id, user_id} = params;
    const {amount} = body;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    await eventChecklist(event_id, token);

    // Check if invited user has permission to see the event
    await checkUserCanAccessEvent(event_id, user_id);

    // Insert user into the event
    const query = `
        UPDATE event_users
        SET amount_paid = $1,
            paid        = true
        WHERE user_id = $2
          AND event_id = $3
        RETURNING *;
    `;
    const values = [amount, user_id, event_id];

    const res = await client.query(query, values);
    return res.rows[0];
};

exports.updateEventUser = async (params, body, headers) => {
    const eventId = params.event_id;
    const userIdToUpdate = params.user_id;
    const status = body.status;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await eventChecklist(eventId, token);

    // Get event and user associated with event_user record
    const selectQuery = `
        SELECT eu.event_id, eu.user_id, e.created_by
        FROM event_users eu
                 JOIN events e ON eu.event_id = e.id
        WHERE eu.event_id = $1
          and eu.user_id = $2;
    `;
    const selectRes = await client.query(selectQuery, [eventId, userIdToUpdate]);
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
        WHERE event_id = $2
          AND user_id = $3
        RETURNING *;
    `;
    const values = [status, eventUser.event_id, eventUser.user_id];

    const res = await client.query(updateQuery, values);
    return res.rows[0];
};

exports.deleteEventUser = async (params, headers) => {
    const eventId = params.event_id;
    const tokenHeader = headers["authorization"];
    const token = tokenHeader ? tokenHeader.split(" ")[1] : null;
    const userId = await eventChecklist(eventId, token);
    const userIdToDelete = params.user_id ?? userId;

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
        return {user_id: userId, event_id: eventId, status: undefined};
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
        WHERE user_id = $1
          AND event_id = $2
        RETURNING *;
    `;
    await client.query(deleteQuery, [userId, eventId]);
    return {user_id: userId, event_id: eventId, status: undefined};
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
            userId = decoded.id;
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


const generateGoogleCalEvent = async (event) => {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const auth = new GoogleAuth({
        keyFile: keyFile,
        scopes: "https://www.googleapis.com/auth/calendar",
    });

    const cal = google.calendar({version: "v3", auth: auth});
    const eventData = {
        summary: event.title,
        location: event.location || "",
        description: event.description || "",
        start: {
            dateTime: new Date(event.start_time).toISOString(),
            timeZone: "UTC",
        },
        end: {
            dateTime: new Date(new Date(event.start_time).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour later
            timeZone: "UTC",
        },
    };
    const googleEvent = await cal.events.insert({calendarId: process.env.GOOGLE_CALENDAR_ID, resource: eventData});

    return googleEvent.data;
};