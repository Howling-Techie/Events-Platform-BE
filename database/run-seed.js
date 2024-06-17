const seed = require("./seed.js");


const runSeed = () => {
    return seed().then(() => {
        console.log("database seeded");
    });
};

runSeed();
