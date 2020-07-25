const dotenv = require('dotenv');

dotenv.config();

module.exports = {
    MONGODB_CONNECTION: process.env.MONGODB_CONNECTION,
    CHECKER_NAME: process.env.CHECKER_NAME
};