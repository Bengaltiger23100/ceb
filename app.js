const Discord = require(`discord.js`);
var commands = require(`./commands`);
var mysql = require('mysql2');
var db = require(`./db`);
var log = require(`./log`);

const token = process.env.BOT_TOKEN;

const client = new Discord.Client();
const commandPrefix = `;`;

client.login(token);

client.on(`ready`, async () => {
    log(`Connected as ${client.user.tag}.`);
    log(`Checking to see if there are guilds not added to the database.`);

    try {
        let connected_guilds = client.guilds.array();
        let query = ``;
        let count = 0;
        let playlist_id = 1;

        let guilds = await db.query(`SELECT * FROM guilds`);

        connected_guilds.forEach(guild => {
            if (!guilds[0].some(e => e.guild_id === guild.id)) {
                query += mysql.format(`INSERT INTO guilds (guild_id) VALUES (?);`, [guild.id]);
                query += mysql.format(`INSERT INTO settings (guild_id) VALUES (?);`, [guild.id]);
                query += mysql.format(`INSERT INTO playlists (playlist_id, guild_id, name) VALUES (?, ?, ?);`, [playlist_id, guild.id, `New Playlist`]);
                query += mysql.format(`INSERT INTO currents (guild_id, playlist_id) VALUES (?, ?);`, [guild.id, playlist_id++]);
                count++;
            }
        });

        if (query != ``) {
            await db.query(query);
            log(`${count} guild(s) are not found in the database. They all have been added now.`);
        } else {
            log(`All guilds that the bot is connected to are already in the database.`);
        }

        log(`The music bot is ready.`);
    } catch (err) {
        log(`Initialization error. \n Where: 'ready' event in app.js \n Error Message: ${err.message}`);
    }
});

client.on(`guildCreate`, async guild => {
    try {
        let playlist_id = 1;
        let playlists = await db.query(`SELECT MAX(playlist_id) AS playlist_id FROM playlists`);

        if (playlists[0][0] != null) {
            playlist_id = playlists[0][0].playlist_id + 1;
        }

        await db.query(`INSERT INTO guilds (guild_id) VALUES (?); INSERT INTO settings (guild_id) VALUES (?);`, [guild.id, guild.id]);
        await db.query(`INSERT INTO playlists (playlist_id, guild_id, name) VALUES (?, ?, ?); INSERT INTO currents (guild_id, playlist_id) VALUES (?, ?);`, [playlist_id, guild.id, `New Playlist`, guild.id, playlist_id]);

        log(`A new guild has been added. \n Guild Name: ${guild.name} | Guild ID: ${guild.id} | `);
    } catch (err) {
        log(`Database error when adding a new guild. \n Where: 'guildCreate' event in app.js \n Error Message: ${err.message}`);
    }
});

client.on(`message`, msg => {
    if (msg.content.startsWith(commandPrefix) && msg.guild) {
        let command = msg.content.substr(1).split(` `)[0];

        switch (command) {
            case `clearqueue`:
            case `clear`:
                commands.clear(msg);
                break;
            case `removesong`:
                if (numOfArgs(msg.content) != 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Queue Number>` } });
                } else {
                    commands.removesong(msg);
                }
                break;
            case `removeplaylist`:
                if (numOfArgs(msg.content) != 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Playlist Number>` } });
                } else {
                    commands.removeplaylist(msg);
                }
                break;
            case `newplaylist`:
            case `createplaylist`:
            case `addplaylist`:
                if (numOfArgs(msg.content) < 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Playlist Name>` } });
                } else {
                    commands.createplaylist(msg);
                }
                break;
            case `renameplaylist`:
                if (numOfArgs(msg.content) < 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <New Playlist Name>` } });
                } else {
                    commands.renameplaylist(msg);
                }
                break;
            case `setplaylist`:
                if (numOfArgs(msg.content) != 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Playlist Number>` } });
                } else {
                    commands.setplaylist(msg);
                }
                break;
            case `listplaylists`:
            case `listplaylist`:
                if (numOfArgs(msg.content) > 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntaxes:**\n${commandPrefix}${command}\n${commandPrefix}${command} <Page Number>` } });
                } else {
                    commands.listplaylists(msg);
                }
                break;
            case `currentsong`:
            case `np`:
            case `nowplaying`:
                commands.currentsong(msg);
                break;
            case `currentplaylist`:
                commands.currentplaylist(msg);
                break;
            case `shuffle`:
                commands.shuffle(msg);
                break;
            case `loop`:
                commands.loop(msg);
                break;
            case `deleteonplay`:
                commands.deleteonplay(msg);
                break;
            case `swap`:
                if (numOfArgs(msg.content) != 2) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Queue Number> <Queue Number>` } });
                } else {
                    commands.swap(msg);
                }
                break;
            case `join`:
                commands.join(msg);
                break;
            case `queue`:
            case `queues`:
            case `listsongs`:
            case `listsong`:
                if (numOfArgs(msg.content) > 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntaxes:**\n${commandPrefix}${command}\n${commandPrefix}${command} <Page Number>` } });
                } else {
                    commands.queue(msg);
                }
                break;
            case `skip`:
            case `next`:
                commands.skip(msg);
                break;
            case `pause`:
                commands.pause(msg);
                break;
            case `resume`:
                commands.resume(msg);
                break;
            case `removedupe`:
            case `removedupes`:
            case `removeduplicate`:
            case `removeduplicates`:
                commands.removeduplicates(msg);
                break;
            case `add`:
                if (numOfArgs(msg.content) != 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntaxes:**\n${commandPrefix}${command} <Youtube URL>\n${commandPrefix}${command} <Youtube Playlist URL>` } });
                } else {
                    commands.add(msg);
                }
                break;
            case `play`:
                if (numOfArgs(msg.content) > 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntaxes:**\n${commandPrefix}${command}\n${commandPrefix}${command} <Youtube URL>\n${commandPrefix}${command} <Youtube Playlist URL>` } });
                } else {
                    commands.play(msg);
                }
                break;
            case `playnow`:
                if (numOfArgs(msg.content) != 1) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command syntax.\n\n**Correct Syntax:**\n${commandPrefix}${command} <Queue Number>` } });
                } else {
                    commands.playnow(msg);
                }
                break;
            case `stop`:
            case `leave`:
            case `end`:
                commands.stop(msg);
                break;
            case `help`:
            case `commands`:
                let output = ``;
                output += `**;play**  or  **;play <Youtube URL>** - Adds songs to the front of the queue and plays it immediately.\n\n`;
                output += `**;add <Youtube URL>** - Adds songs to the back of the queue.\n\n`;
                output += `**;np**  or  **;nowplaying** - Gets the current playing song's info.\n\n`;
                output += `**;queue** or **;queue <Page Number>** - Lists the queue and its queue numbers.\n\n`;
                output += `**;swap <Queue Number> <Queue Number>** - Swaps the position of the songs in the queue.\n\n`;
                output += `**;playnow <Queue Number>** - Immediately plays the song from the queue.\n\n`;
                output += `**;clear** - Clears the queue.\n\n`;
                output += `**;removesong <Queue Number>** - Removes the song from the queue.\n\n`;
                output += `**;createplaylist <Playlist Name>** - Creates a playlist.\n\n`;
                output += `**;removeplaylist <Playlist Number>** - Removes the playlist.\n\n`;
                output += `**;setplaylist <Playlist Number>** - Sets the current playlist.\n\n`;
                output += `**;listplaylists**  or  **;listplaylists <Page Number>** - Lists the playlists and its playlist numbers.\n\n`;
                output += `**;currentplaylist** - Shows the current set playlist name.\n\n`;
                output += `**;renameplaylist <New Playlist Name>** - Renames the currently set playlist.\n\n`;
                output += `**;removeduplicates** - Removes duplicate songs in the queue.\n\n`;
                output += `**;deleteonplay** - If enabled, played songs are removed from the queue.\n\n`;
                output += `**;loop** - Enable or disable song loops.\n\n`;
                output += `**;skip** - Skips the current song.\n\n`;
                output += `**;stop** - Stops the music bot.\n\n`;
                output += `**;pause** - Pauses the music bot.\n\n`;
                output += `**;resume** - Resumes the music bot.\n\n`;
                output += `**;shuffle** - Shuffles the queue.\n\n`;
                output += `**;join** - Music bot joins the voice channel.\n\n`;
                output += `**;leave** - Music bot leaves the voice channel.`;

                msg.reply({ embed: { title: `:information_source: Status: Info`, description: output } });
                break;
            default:
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid command.` } });
                break;
        }
    }
});

function numOfArgs(command) {
    if (command.includes(` `)) {
        return command.split(` `).length - 1;
    } else {
        return 0;
    }
}
