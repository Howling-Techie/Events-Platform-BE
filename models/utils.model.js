const client = require("../database/connection");
const format = require("pg-format");
const {sign, verify, decode} = require("jsonwebtoken");


exports.generateToken = (payload, duration = "1hr") => {
    return sign(payload, process.env.JWT_KEY, {expiresIn: duration});
};
exports.verifyToken = (token) => {
    try {
        return verify(token, process.env.JWT_KEY);
    } catch (err) {
        return null;
    }
};
exports.refreshToken = (token) => {
    const decodedToken = decode(token);
    const currentTime = Date.now() / 1000;

    if (decodedToken && decodedToken.exp - currentTime < 300) { // If token expires in less than 5 minutes
        return sign({...decodedToken, iat: currentTime}, process.env.JWT_KEY, {expiresIn: "1h"});
    }

    return token;
};

exports.checkIfExists = async (tableName, columnName, value) => {
    if (Number.isNaN(value)) {
        const query = format("SELECT %I FROM %I WHERE %I like %L", columnName, tableName, columnName, +value);
        return (await client.query(query)).rows.length > 0;
    }
    const query = format("SELECT %I FROM %I WHERE %I = %L", columnName, tableName, columnName, value.toString());
    return (await client.query(query)).rows.length > 0;
};

exports.canUserAccessEvent = async (event_id, user_id) => {
    // Check if the user can access the given event
    const result = await client.query(
        `SELECT e.*
         FROM events e
                  LEFT JOIN groups g ON e.group_id = g.id
                  LEFT JOIN user_groups ug ON ug.group_id = g.id AND ug.user_id = $1
         WHERE (
             (e.visibility = 0 AND g.visibility = 0)
                 OR
             (ug.user_id = $1 AND e.visibility <= ug.access_level)
             )
           AND e.event_id = $2`,
        [user_id, event_id]
    );
    // If a row is returned, they have access
    return result.rows.length > 0;
};