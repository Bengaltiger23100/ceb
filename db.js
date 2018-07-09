var mysql = require(`mysql2/promise`);

var pool = mysql.createPool({
    host: `localhost`,
    user: `DB_USER`,
    password: `DB_PASS`,
    database: `DB_NAME`,

    multipleStatements: true
});

module.exports = pool;
