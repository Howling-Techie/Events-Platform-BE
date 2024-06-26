const client = require("../database/connection");
const {generateUserToken} = require("./utils.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

exports.signInUser = async (body) => {
    try {
        // Check if the user exists
        const userQuery = "SELECT * FROM users WHERE username = $1";
        const res = await client.query(userQuery, [body.username]);

        // If they do, confirm password
        if (res.rows.length > 0) {
            const user = res.rows[0];
            const match = await bcrypt.compare(body.password, user.password);

            // Return a user token on match, otherwise return an error
            if (match) {
                return generateUserToken(user);
            } else {
                return Promise.reject({status: 403, msg: "Password does not match."});
            }
        } else {
            // If user not found, return the error
            return Promise.reject({status: 404, msg: "User not found."});
        }
    } catch (err) {
        return Promise.reject(err);
    }
};

exports.refreshCurrentUser = async (body) => {
    const {refreshToken} = body;

    if (!refreshToken) {
        return Promise.reject({status: 400, msg: "Missing refresh token"});
    }
    try {
        // If a token is provided, make sure it's a valid refresh token before returning a new user token
        const decoded = jwt.verify(refreshToken, process.env.JWT_KEY);
        const userResponse = await client.query(`SELECT *
                                                 FROM users
                                                 WHERE id = $1;`, [decoded.id]);
        return generateUserToken(userResponse.rows[0]);
    } catch {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};
