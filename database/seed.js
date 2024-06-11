const client = require("./connection");

async function seed(data) {
    try {
        // Drop tables if they exist
        await dropTables();

        // Recreate tables
        await createTables();

        // Insert data if provided
        if (data) {
            await insertData(data);
        }
    } catch (error) {
        console.error("Error seeding tables:", error);
    }
}

async function dropTables() {
    // Drop tables in reverse order to avoid foreign key constraints
    await client.query("DROP TABLE IF EXISTS comments;");
    await client.query("DROP TABLE IF EXISTS event_users;");
    await client.query("DROP TABLE IF EXISTS events;");
    await client.query("DROP TABLE IF EXISTS user_groups;");
    await client.query("DROP TABLE IF EXISTS groups;");
    await client.query("DROP TABLE IF EXISTS user_contacts;");
    await client.query("DROP TABLE IF EXISTS users;");
}

async function createTables() {
    // Create users table
    await client.query(`
        CREATE TABLE IF NOT EXISTS users
        (
            id           SERIAL PRIMARY KEY,
            username     VARCHAR(255) NOT NULL UNIQUE,
            display_name VARCHAR(255),
            email        VARCHAR(255) UNIQUE,
            avatar       VARCHAR(255),
            password     VARCHAR(255),
            about        TEXT         NOT NULL DEFAULT ''
        );
    `);

    // Create user_contacts table
    await client.query(`
        CREATE TABLE IF NOT EXISTS user_contacts
        (
            user_id    INTEGER REFERENCES users (id),
            contact_id INTEGER REFERENCES users (id),
            note       TEXT,
            PRIMARY KEY (user_id, contact_id)
        );
    `);

    // Create groups table
    await client.query(`
        CREATE TABLE IF NOT EXISTS groups
        (
            id         SERIAL PRIMARY KEY,
            name       VARCHAR(255)      NOT NULL,
            visibility INTEGER DEFAULT 0 NOT NULL,
            about      TEXT,
            avatar     VARCHAR(255),
            owner_id   INTEGER REFERENCES users (id)
        );
    `);

    // Create user_groups table
    await client.query(`
        CREATE TABLE IF NOT EXISTS user_groups
        (
            user_id      INTEGER REFERENCES users (id)  NOT NULL,
            group_id     INTEGER REFERENCES groups (id) NOT NULL,
            access_level INTEGER DEFAULT 1              NOT NULL,
            PRIMARY KEY (user_id, group_id)
        );
    `);

    // Create events table
    await client.query(`
        CREATE TABLE IF NOT EXISTS events
        (
            id                SERIAL PRIMARY KEY,
            group_id          INTEGER REFERENCES groups (id),
            created_by        INTEGER REFERENCES users (id)           NOT NULL,
            visibility        INTEGER       DEFAULT 0                 NOT NULL,
            start_time        TIMESTAMPTZ,
            location          VARCHAR(255),
            google_link       VARCHAR,
            time_created      TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP NOT NULL,
            title             VARCHAR(255)                            NOT NULL,
            description       TEXT,
            price             NUMERIC(6, 2) DEFAULT 0,
            pay_what_you_want BOOLEAN       DEFAULT FALSE
        );
    `);

    // Create event_users table
    await client.query(`
        CREATE TABLE IF NOT EXISTS event_users
        (
            event_id    INTEGER REFERENCES events (id) NOT NULL,
            user_id     INTEGER REFERENCES users (id)  NOT NULL,
            status      INTEGER       DEFAULT 0        NOT NULL,
            paid        BOOLEAN       DEFAULT FALSE,
            amount_paid NUMERIC(6, 2) DEFAULT 0,
            PRIMARY KEY (event_id, user_id)
        );
    `);

    // Create comments table
    await client.query(`
        CREATE TABLE IF NOT EXISTS comments
        (
            id             SERIAL PRIMARY KEY,
            event_id       INTEGER REFERENCES events (id),
            user_id        INTEGER REFERENCES users (id)         NOT NULL,
            time_submitted TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            comment        TEXT
        );
    `);
}

async function insertData(data) {
    // Insert data into each table
    await insertDataIntoTable("users", data.users);
    await insertDataIntoTable("user_contacts", data.userContacts);
    await insertDataIntoTable("groups", data.groups);
    await insertDataIntoTable("user_groups", data.userGroups);
    await insertDataIntoTable("events", data.events);
    await insertDataIntoTable("event_users", data.eventUsers);
    await insertDataIntoTable("comments", data.eventComments);
}

async function insertDataIntoTable(tableName, dataArray) {
    const columns = Object.keys(dataArray[0]).join(", ");
    const values = dataArray.map((data) => Object.values(data));

    const query = `INSERT INTO ${tableName} (${columns})
    VALUES
    ${generateValuesPlaceholder(values)}`;
    await client.query(query, values.flat());
}

function generateValuesPlaceholder(values) {
    const rowsPlaceholder = values.map((_, index) => `(${values[0].map((_, i) => `$${index * values[0].length + i + 1}`).join(", ")})`).join(", ");
    return `${rowsPlaceholder}`;
}

module.exports = seed;
