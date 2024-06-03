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
