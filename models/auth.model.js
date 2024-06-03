const client = require("../database/connection");
const {generateToken} = require("./utils.model");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require("bcrypt");

exports.signInUser = async (body) => {
    try {
        const userQuery = "SELECT * FROM users WHERE username = $1";
        const res = await client.query(userQuery, [body.username]);

        if (res.rows.length > 0) {
            const user = res.rows[0];
            const match = await bcrypt.compare(body.password, user.password);

            if (match) {
                return generateReturnObject(user);
            } else {
                return Promise.reject({status: 403, msg: "Password does not match."});
            }
        } else {
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
        const decoded = jwt.verify(refreshToken, process.env.JWT_KEY);
        const userResponse = await client.query(`SELECT *
                                                 FROM users
                                                 WHERE id = $1;`, [decoded.id]);
        return generateReturnObject(userResponse.rows[0]);
    } catch {
        return Promise.reject({status: 401, msg: "Unauthorised"});
    }
};

const generateReturnObject = (user) => {
    const response = {...user};
    response.tokens = {
        accessToken: generateToken({
            id: user.user_id,
            username: user.username,
            displayName: user.display_name
        }),
        refreshToken: generateToken({id: user.id}, "7d")
    };
    const tokenExpiration = Date.now() + 60 * 60 * 1000;
    const refreshExpiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
    response.expiration = {auth: tokenExpiration, refresh: refreshExpiration};
    return response;
};
