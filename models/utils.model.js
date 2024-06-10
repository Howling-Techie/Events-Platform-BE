const client = require("../database/connection");
const format = require("pg-format");
const jwt = require("jsonwebtoken");

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_KEY);
    } catch (err) {
        return null;
    }
};
const refreshToken = (token) => {
    const decodedToken = jwt.decode(token);
    const currentTime = Date.now() / 1000;

    if (decodedToken && decodedToken.exp - currentTime < 300) { // If token expires in less than 5 minutes
        return jwt.sign({...decodedToken, iat: currentTime}, process.env.JWT_KEY, {expiresIn: "1h"});
    }

    return token;
};

const checkIfExists = async (tableName, columnName, value) => {
    if (Number.isNaN(value)) {
        const query = format("SELECT %I FROM %I WHERE %I like %L", columnName, tableName, columnName, +value);
        return (await client.query(query)).rows.length > 0;
    }
    const query = format("SELECT %I FROM %I WHERE %I = %L", columnName, tableName, columnName, value.toString());
    return (await client.query(query)).rows.length > 0;
};

const checkUserCanAccessEvent = async (eventId, userId) => {
    if (!eventId) {
        return Promise.reject({status: 400, msg: "Event ID not provided"});
    }
    if (Number.isNaN(eventId)) {
        return Promise.reject({status: 400, msg: "Invalid event_id datatype"});
    }
    if (!(await checkIfExists("events", "id", +eventId))) {
        return Promise.reject({status: 404, msg: "Event not found"});
    }

    const query = `
        SELECT e.id,
               e.created_by,
               e.visibility,
               e.group_id,
               g.visibility as group_visibility,
               ug.user_id,
               ug.access_level
        FROM events e
                 LEFT JOIN public.groups g on g.id = e.group_id
                 LEFT OUTER JOIN public.user_groups ug on g.id = ug.group_id
        WHERE e.id = $1;
    `;
    const res = await client.query(query, [eventId]);
    // If event and group are public, return true
    if (res.rows[0].visibility === 0 && res.rows[0].group_visibility === 0) {
        return true;
    }
    // If the user created the event, return true
    if (res.rows[0].created_by === userId) {
        return true;
    }
    // If the user is in the group, check their access level
    const userRow = res.rows.find((row) => row.user_id === userId);
    if (userRow && userRow.visibility <= userRow.access_level) {
        return true;
    }
    // If this has all failed, reject the request
    return Promise.reject({status: 401, msg: "Unauthorised"});
};

const checkUserCanAccessGroup = async (groupId, userId) => {
    const query = `
        SELECT g.id,
               g.owner_id,
               g.visibility,
               ug.user_id,
               ug.access_level
        FROM groups g
                 LEFT JOIN public.user_groups ug on g.id = ug.group_id
        WHERE g.id = $1;
    `;
    const res = await client.query(query, [groupId]);
    // If the user owns the group, return true
    if (res.rows[0].owner_id === userId) {
        return true;
    }
    // If group is public, return true
    if (res.rows[0].visibility === 0) {
        return true;
    }
    // If the user is in the group, check their access level
    const userRow = res.rows.find((row) => row.user_id === userId);
    if (userRow) {
        return true;
    }
    // If this has all failed, reject the request
    return Promise.reject({status: 401, msg: "Unauthorised"});
};

const generateUserToken = (user) => {
    const response = {};
    response.user = {id: user.id, username: user.username, display_name: user.display_name, avatar: user.avatar};
    response.tokens = {
        accessToken: jwt.sign({
            id: user.id,
            username: user.username,
            displayName: user.display_name
        }, process.env.JWT_KEY, {expiresIn: "1hr"}),
        refreshToken: jwt.sign({id: user.id}, process.env.JWT_KEY, {expiresIn: "7d"})
    };
    const tokenExpiration = Date.now() + 60 * 60 * 1000;
    const refreshExpiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
    response.expiration = {auth: tokenExpiration, refresh: refreshExpiration};
    return response;
};

module.exports = {
    generateUserToken,
    checkUserCanAccessEvent,
    checkUserCanAccessGroup,
    checkIfExists,
    verifyToken,
    refreshToken
};