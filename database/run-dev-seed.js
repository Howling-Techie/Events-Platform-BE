const devData = require("./data/development-data/index.js");
const seed = require("./seed.js");


const runSeed = () => {
    return seed(devData).then(() => {
        console.log("database seeded");
    });
};

runSeed();
