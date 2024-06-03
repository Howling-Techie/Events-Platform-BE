const {Pool} = require("pg");
const fs = require("fs");
const ENV = process.env.NODE_ENV || "development";
const config = {};

require("dotenv").config({
    path: `${__dirname}/../.env.${ENV}`,
});

if (!process.env.DATABASE_NAME && !process.env.DATABASE_HOST) {
    throw new Error("DATABASE_NAME or DATABASE_HOST not set");
}

if (ENV === "production") {
    config.connectionString = process.env.DATABASE_URL;
    config.max = 4;
}
const pool = new Pool({
    user: process.env.DATABASE_USER,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME,
    password: process.env.DATABASE_PASS,
    port: process.env.DATABASE_PORT,
    ssl: {
        rejectUnauthorized: false,
        ca: fs.readFileSync("" + process.env.DB_CERT).toString(),
    },
});

/**
 * Query the database using a SQL string
 *
 * @param {string} command
 * @param {Array} parameters
 * @returns {Promise}
 */
const query = async (command, parameters = []) => {
    try {
        const start = Date.now();
        const res = await pool.query(command, parameters);
        const duration = Date.now() - start;
        console.log("Executed query", {command, duration, rows: res.rowCount});
        return res;
    } catch (err) {
        console.error(`Error executing query: ${err}`);
        throw err;
    }
};
module.exports = {
    query
};