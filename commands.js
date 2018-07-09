const ytdl = require(`ytdl-core`);
const ytlist = require(`youtube-playlist`);
var validUrl = require(`valid-url`);
var mysql = require('mysql2');
var shuffle = require(`shuffle-array`);
var db = require(`./db`);
var log = require(`./log`);

var dispatchers = {};

function removeDispatcher(guild_id) {
    delete dispatchers[guild_id];
}

function setDispatcher(guild_id, disp) {
    dispatchers[guild_id] = disp;
}

function getDispatcher(guild_id) {
    return dispatchers[guild_id];
}

function musicStopped(guild_id) {
    return !dispatchers[guild_id] || dispatchers[guild_id].destroyed;
}

function musicPaused(guild_id) {
    return dispatchers[guild_id] && dispatchers[guild_id].paused;
}

function botInVoice(msg, show_message) {
    if (!msg.guild.voiceConnection) {
        if (show_message) {
            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The music bot is not in a voice channel.` } });
        }
        return false;
    }

    return true;
}

function userInVoice(msg, show_message) {
    if (!msg.member.voiceChannel) {
        if (show_message) {
            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `You have to be in a voice channel.` } });
        }
        return false;
    }

    return true;
}

function bothInVoice(msg, show_message) {
    if (msg.member.voiceChannelID != msg.guild.voiceConnection.channel.id) {
        if (show_message) {
            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `You have to be in the same voice channel as the music bot.` } });
        }
        return false;
    }

    return true;
}

async function play(msg, voice_con) {
    try {
        let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
        let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);
        let settings = await db.query(`SELECT * FROM settings WHERE guild_id`, [msg.guild.id]);

        let current_queue = queues[0][0];

        if (queues[0].length < 1) {
            msg.channel.send({ embed: { title: `:information_source: Status: Info`, description: `There are no songs in the queue. The music bot is now disconnecting.` } });
            voice_con.disconnect();
            return;
        }

        setDispatcher(msg.guild.id, voice_con.playStream(ytdl(`https://www.youtube.com/watch?v=${current_queue.video_id}.`, {
            filter: `audioonly`,
            quality: `highestaudio`
        })));

        await db.query(`UPDATE currents SET title = ?, video_id = ? WHERE guild_id = ?`, [current_queue.title, current_queue.video_id, msg.guild.id]);

        // If loop is enabled then don't do anything to the song playing.
        if (!settings[0][0].loop_queue) {
            if (settings[0][0].delete_on_play) {
                await db.query(`DELETE FROM queues WHERE id = ?`, [current_queue.id]);
            } else {
                if (queues[0].length > 1) {
                    // If loop and delete on play is not enabled then move the song to the back of the queue.
                    let last_queue_position = queues[0][queues[0].length - 1].position;

                    await db.query(`UPDATE queues SET position = ? WHERE id = ?`, [last_queue_position + 1, current_queue.id]);
                }
            }
        }

        voice_con.on(`disconnect`, () => {
            removeDispatcher(msg.guild.id);
        });

        getDispatcher(msg.guild.id).on(`end`, async reason => {
            let settings = await db.query(`SELECT * FROM settings WHERE guild_id`, [msg.guild.id]);

            if (reason == `STOP`) {
                voice_con.disconnect();
                return;
            }

            if (reason == `SKIP` && settings[0][0].loop_queue) {
                let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
                let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

                // Skips the song and places it to the back of the queue.
                let current_queue = queues[0][0];
                let last_queue_position = queues[0][queues[0].length - 1].position;

                await db.query(`UPDATE queues SET position = ? WHERE id = ?`, [last_queue_position + 1, current_queue.id]);

                play(msg, voice_con);
            } else {
                play(msg, voice_con);
            }
        });
    } catch (err) {
        log(`Database error when trying play songs.\nWhere: 'play' function in commands.js\nError Message: ${err.message}`);

        voice_con.disconnect();

        msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The music bot may not be playing any music and may disconnect.` } });
    }
}

module.exports = {
    clear: async (msg) => {
        try {
            await db.query(`DELETE FROM queues WHERE guild_id = ?`, [msg.guild.id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The queue has been cleared.` } });
        } catch (err) {
            log(`Database error when trying to clear queue.\nWhere: 'clear' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The queue failed to clear.` } });
        }
    },

    createplaylist: async (msg) => {
        try {
            let playlist_name = msg.content.replace(msg.content.split(` `)[0], ``).trim();

            if (playlist_name.length > 30) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The max length for the playlist name is 30 characters.` } });
                return;
            }

            let playlist_id = 1;
            let playlists = await db.query(`SELECT MAX(playlist_id) AS playlist_id FROM playlists`);

            if (playlists[0][0] != null) {
                playlist_id = playlists[0][0].playlist_id + 1;
            }

            await db.query(`INSERT INTO playlists (playlist_id, guild_id, name) VALUES (?, ?, ?)`, [playlist_id, msg.guild.id, playlist_name]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The playlist with the name **${playlist_name}** has been created.` } });
        } catch (err) {
            log(`Database error when trying to create a new playlist.\nWhere: 'newplaylist' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The playlist failed to create.` } });
        }
    },

    renameplaylist: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);

            let new_playlist_name = msg.content.replace(msg.content.split(` `)[0], ``).trim();

            if (new_playlist_name.length > 30) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The max length for the playlist name is 30 characters.` } });
                return;
            }

            await db.query(`UPDATE playlists SET name = ? WHERE playlist_id = ?`, [new_playlist_name, currents[0][0].playlist_id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The current playlist has been renamed to **${new_playlist_name}**.` } });
        } catch (err) {
            log(`Database error when trying to rename a playlist.\nWhere: 'renameplaylist' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. Failed to rename the playlist.` } });
        }
    },


    listplaylists: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let playlists = await db.query(`SELECT * FROM playlists WHERE guild_id = ?`, [msg.guild.id]);

            let numShowEachPage = 10;
            let page = 1;
            let totalPages = Math.ceil(playlists[0].length / numShowEachPage);

            if (msg.content.split(' ').length - 1 == 1) {
                page = parseInt(msg.content.split(' ')[1]);

                if (!Number.isInteger(page)) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid page number.` } });
                    return;
                }

                if (page < 1 || page > totalPages) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That page number does not exist.` } });
                    return;
                }
            }

            let queue_output = ``;

            for (let i = (page * numShowEachPage - numShowEachPage); i < (page * numShowEachPage); i++) {
                if (playlists[0][i] === undefined) {
                    break;
                }

                if (i == (page * numShowEachPage - numShowEachPage)) {
                    queue_output += `**${i + 1}. ${playlists[0][i].name}**\n\n`;
                } else {
                    queue_output += `**${i + 1}. ${playlists[0][i].name}**\n\n`;
                }
            }

            msg.reply(``, { embed: { title: `:musical_note: Playlist List`, description: `${queue_output}\n**Page ${page} of ${totalPages}\nCurrent Playlist:** ${currents[0][0].name}` } });
        } catch (err) {
            log(`Database error when trying to retrieve the list of playlists.\nWhere: 'listplaylists' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. Failed to retrieve the list of playlists.` } });
        }
    },

    currentsong: async (msg) => {
        if (musicStopped(msg.guild.id)) {
            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `There is no music playing.` } });
        } else {
            try {
                let currents = await db.query(`SELECT title, video_id FROM currents WHERE guild_id = ?`, [msg.guild.id]);

                msg.reply({ embed: { title: `:information_source: Status: Info`, description: `The current song is **[${currents[0][0].title}](https://www.youtube.com/watch?v=${currents[0][0].video_id})**.` } });
            } catch (err) {
                log(`Database error when trying to retrieve the current song.\nWhere: 'currentsong' function in commands.js\nError Message: ${err.message}`);

                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. Failed to retrieve current song.` } });
            }
        }
    },

    currentplaylist: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);

            msg.reply({ embed: { title: `:information_source: Status: Info`, description: `The current playlist is named **${currents[0][0].name}**.` } });
        } catch (err) {
            log(`Database error when trying to retrieve the current playlist.\nWhere: 'currentplaylist' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. Failed to retrieve current playlist.` } });
        }

    },

    shuffle: async (msg) => {
        let query = ``;
        let pos = 0;

        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            if (queues[0].length < 2) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `There must be at least two songs in order to shuffle.` } });
                return;
            }

            shuffle(queues[0]);

            queues[0].forEach(queue => {
                query += mysql.format(`UPDATE queues SET position = ? WHERE id = ?; `, [pos++, queue.id]);
            });

            await db.query(query);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The queue has been shuffled.` } });
        } catch (err) {
            log(`Database error when trying to shuffle the queue.\nWhere: 'shuffle' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The queue failed to shuffle.` } });
        }
    },

    loop: async (msg) => {
        try {
            let settings = await db.query(`SELECT * FROM settings WHERE guild_id = ?`, [msg.guild.id]);
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            if (settings[0][0].delete_on_play) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `You have delete on play on. You cannot have both enabled at the same time.` } });
                return;
            }

            if (settings[0][0].loop_queue) {
                // Disable loop.
                await db.query(`UPDATE settings SET loop_queue = ? WHERE guild_id = ?`, [!settings[0][0].loop_queue, msg.guild.id]);

                if (!musicStopped(msg.guild.id) && queues[0].length > 1) {
                    // Move first song to the back 

                    let last_queue_position = queues[0][queues[0].length - 1].position;
                    await db.query('UPDATE queues SET position = ? WHERE id = ?', [last_queue_position + 1, queues[0][0].id]);
                }

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `Loop has been disabled.` } });
            } else {
                // Enable loop.
                await db.query(`UPDATE settings SET loop_queue = ? WHERE guild_id = ?`, [!settings[0][0].loop_queue, msg.guild.id]);

                if (!musicStopped(msg.guild.id) && queues[0].length > 1) {
                    // Move last song to the front.

                    let first_queue_position = queues[0][0].position;
                    await db.query('UPDATE queues SET position = ? WHERE id = ?', [first_queue_position - 1, queues[0][queues[0].length - 1].id]);
                }

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `Loop has been enabled.` } });
            }
        } catch (err) {
            log(`Database error when trying to enable/disable the loop setting.\nWhere: 'loop' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The loop setting failed to enable/disable.` } });
        }
    },

    deleteonplay: async (msg) => {
        try {
            let settings = await db.query(`SELECT * FROM settings WHERE guild_id = ?`, [msg.guild.id]);

            if (settings[0][0].loop_queue) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `You have loop on. You cannot have both enabled at the same time.` } });
                return;
            }

            await db.query(`UPDATE settings SET delete_on_play = ? WHERE guild_id = ?`, [!settings[0][0].delete_on_play, msg.guild.id]);

            if (settings[0][0].delete_on_play) {
                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `Delete on play has been disabled.` } });
            } else {
                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `Delete on play has been enabled.` } });
            }
        } catch (err) {
            log(`Database error when trying to enable/disable the delete on play setting.\nWhere: 'deleteonplay' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The delete on play setting failed to enable/disable.` } });
        }
    },

    join: (msg) => {
        if (userInVoice(msg, true)) {
            if (!msg.member.voiceChannel.joinable) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The music bot does not have permission to join the voice channel.` } });
            } else {
                msg.member.voiceChannel.join();
            }
        }
    },

    queue: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            if (queues[0].length < 1) {
                msg.reply({ embed: { title: `:information_source: Status: Info`, description: `There are no songs in the queue.` } });
                return;
            }

            let numShowEachPage = 10;
            let page = 1;
            let totalPages = Math.ceil(queues[0].length / numShowEachPage);

            if (msg.content.split(' ').length - 1 == 1) {
                page = parseInt(msg.content.split(' ')[1]);

                if (!Number.isInteger(page)) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid page number.` } });
                    return;
                }

                if (page < 1 || page > totalPages) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That page number does not exist.` } });
                    return;
                }
            }

            let queue_output = ``;

            for (let i = (page * numShowEachPage - numShowEachPage); i < (page * numShowEachPage); i++) {
                if (queues[0][i] === undefined) {
                    break;
                }

                if (i == (page * numShowEachPage - numShowEachPage)) {
                    queue_output += `**${i + 1} (Up Next). [${queues[0][i].title}](https://www.youtube.com/watch?v=${queues[0][i].video_id})**\n\n`;
                } else {
                    queue_output += `**${i + 1}. [${queues[0][i].title}](https://www.youtube.com/watch?v=${queues[0][i].video_id})**\n\n`;
                }
            }

            msg.reply(``, { embed: { title: `:musical_note: Queue List`, description: `${queue_output}\n**Page ${page} of ${totalPages}\nCurrent Playlist:** ${currents[0][0].name}\n**Total Songs in Playlist:** ${queues[0].length}` } });

        } catch (err) {
            log(`Database error when trying to retrieve the queue.\nWhere: 'queue' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The queue failed to retrieve.` } });
        }
    },

    skip: (msg) => {
        if (userInVoice(msg, true) && botInVoice(msg, true) && bothInVoice(msg, true)) {
            if (musicStopped(msg.guild.id)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `There is no song to skip.` } });

            } else {
                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The song has been skipped.` } });

                getDispatcher(msg.guild.id).end(`SKIP`);
            }
        }
    },

    pause: (msg) => {
        if (userInVoice(msg, true) && botInVoice(msg, true) && bothInVoice(msg, true)) {
            if (musicPaused(msg.guild.id)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The music bot is already paused.` } });
                return;
            }

            if (musicStopped(msg.guild.id)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `There is no music to pause.` } });
            } else {
                getDispatcher(msg.guild.id).pause();

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The music bot has been paused.` } });
            }
        }
    },

    resume: (msg) => {
        if (userInVoice(msg, true) && botInVoice(msg, true) && bothInVoice(msg, true)) {
            if (musicStopped(msg.guild.id)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `There is no music to resume.` } });
                return;
            }

            if (!musicPaused(msg.guild.id)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The music bot is not paused.` } });
            } else {
                getDispatcher(msg.guild.id).resume();

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The music bot has been resumed.` } });
            }
        }
    },

    swap: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            let num1 = parseInt(msg.content.split(' ')[1]);
            let num2 = parseInt(msg.content.split(' ')[2]);

            if (!Number.isInteger(num1) || !Number.isInteger(num2)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid queue numbers.` } });
                return;
            }

            if (queues[0][--num1] === undefined || queues[0][--num2] === undefined) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Those queue numbers does not exist. Type **;queue** for the list of queue numbers.` } });
                return;
            }

            let first_queue = queues[0][num1];
            let second_queue = queues[0][num2];

            await db.query(`UPDATE queues SET position = ? WHERE id = ?; UPDATE queues SET position = ? WHERE id = ?`, [second_queue.position, first_queue.id, first_queue.position, second_queue.id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The queue position of **[${first_queue.title}](https://www.youtube.com/watch?v=${first_queue.video_id})** has been swapped with **[${second_queue.title}](https://www.youtube.com/watch?v=${second_queue.video_id})**.` } });
        } catch (err) {
            log(`Database error when trying to swap songs.\nWhere: 'swap' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The queue songs failed to swap.` } });
        }
    },

    setplaylist: async (msg) => {
        try {
            let settings = await db.query(`SELECT * FROM settings WHERE guild_id`, [msg.guild.id]);

            if (settings[0][0].loop_queue) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Loop has to be disabled to switch playlists.` } });
                return;
            }

            if (settings[0][0].delete_on_play) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Delete on play has to be disabled to switch playlists.` } });
                return;
            }

            let playlists = await db.query(`SELECT * FROM playlists WHERE guild_id = ?`, [msg.guild.id]);
            let playlist_num = parseInt(msg.content.split(' ')[1]);

            if (!Number.isInteger(playlist_num)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid playlist number.` } });
                return;
            }

            if (playlists[0][--playlist_num] === undefined) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That playlist number does not exist. Type **;listplaylists** for the list of playlist numbers.` } });
                return;
            }

            let playlist = playlists[0][playlist_num];

            await db.query(`UPDATE currents SET playlist_id = ? WHERE guild_id = ?`, [playlist.playlist_id, msg.guild.id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The playlist has been set to **${playlist.name}**.` } });
        } catch (err) {
            log(`Database error when trying to set a playlist.\nWhere: 'setplaylist' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The selected playlist failed to set.` } });
        }
    },

    removesong: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);
            let queue_num = parseInt(msg.content.split(' ')[1]);

            if (!Number.isInteger(queue_num)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid queue number.` } });
                return;
            }

            if (queues[0][--queue_num] === undefined) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That queue number does not exist. Type **;queue** for the list of queue numbers.` } });
                return;
            }

            let queue = queues[0][queue_num];

            await db.query(`DELETE FROM queues WHERE id = ?`, [queue.id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `**[${queue.title}](https://www.youtube.com/watch?v=${queue.video_id})** has been removed from the queue.` } });
        } catch (err) {
            log(`Database error when trying to remove a song.\nWhere: 'remove' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The song failed to get removed from the queue.` } });
        }
    },

    removeplaylist: async (msg) => {
        try {
            let playlists = await db.query(`SELECT * FROM playlists WHERE guild_id = ?`, [msg.guild.id]);
            let playlist_num = parseInt(msg.content.split(' ')[1]);

            if (!Number.isInteger(playlist_num)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid playlist number.` } });
                return;
            }

            if (playlists[0].length == 1) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `You must have at least one playlist.` } });
                return;
            }

            if (playlists[0][--playlist_num] === undefined) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That playlist number does not exist. Type **;listplaylists** for the list of playlist numbers.` } });
                return;
            }

            let playlist = playlists[0][playlist_num];

            await db.query(`DELETE FROM playlists WHERE playlist_id = ?`, [playlist.playlist_id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `The playlist **${playlist.name}** has been removed.` } });
        } catch (err) {
            log(`Database error when trying to remove a song.\nWhere: 'remove' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The song failed to get removed from the queue.` } });
        }
    },

    removeduplicates: async (msg) => {
        try {
            let results = await db.query(`DELETE q1 FROM queues q1 INNER JOIN queues q2 WHERE q1.id < q2.id AND q1.video_id = q2.video_id AND q1.guild_id = ? AND q2.guild_id = ?;`, [msg.guild.id, msg.guild.id]);

            if (results[0].affectedRows != 0) {
                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `${results[0].affectedRows} duplicate songs has been removed from the queue.` } });
            } else {
                msg.reply({ embed: { title: `:information_source: Status: Info`, description: `There are no duplicate songs in the queue.` } });
            }
        } catch (err) {
            log(`Database error when trying to remove duplicate songs.\nWhere: 'removeduplicates' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. Duplicate songs failed to get removed.` } });
        }
    },

    add: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            let youtube_url = msg.content.split(` `)[1];

            if (youtube_url == null || !validUrl.isUri(youtube_url)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid Youtube link.` } });
                return;
            }

            if (youtube_url.includes('list=')) {
                youtube_url = `https://www.youtube.com/playlist?list=${youtube_url.split(`list=`)[1].split(`&`)[0]}`;
            }

            let video_ids = await ytlist(youtube_url, `id`);
            let titles = await ytlist(youtube_url, `name`);

            msg.delete();

            if (video_ids.data.playlist.length > 0 && titles.data.playlist.length > 0) {
                let queries = ``;
                let last_queue_position = 1;

                if (queues[0].length > 0) {
                    last_queue_position = queues[0][queues[0].length - 1].position + 1;
                }

                let i = 0;
                video_ids.data.playlist.forEach(video_id => {
                    queries += mysql.format(`INSERT INTO queues (guild_id, playlist_id, position, title, video_id) VALUES (?, ?, ?, ?, ?);`, [msg.guild.id, currents[0][0].playlist_id, last_queue_position++, titles.data.playlist[i++], video_id]);
                });

                await db.query(queries);

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `${video_ids.data.playlist.length} songs from the playlist has been added to the queue.` } });
            } else {
                if (!ytdl.validateURL(youtube_url)) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid Youtube link.` } });
                    return;
                }

                let last_queue_position = 0;

                if (queues[0].length > 0) {
                    last_queue_position = queues[0][queues[0].length - 1].position;
                }

                let info = await ytdl.getInfo(youtube_url);

                await db.query(`INSERT INTO queues (guild_id, playlist_id, position, title, video_id) VALUES (?, ?, ?, ?, ?)`, [msg.guild.id, currents[0][0].playlist_id, last_queue_position + 1, info.title, info.video_id]);

                msg.reply({
                    embed: {
                        title: info.title,
                        description: `:white_check_mark: Status: Success \n\n **${info.title}** has been added to the queue.`,
                        url: info.video_url,
                        thumbnail: {
                            url: info.thumbnail_url
                        }
                    }
                });
            }
        } catch (err) {
            log(`Database error when trying to add songs.\nWhere: 'add' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The songs failed to get added to the queue.` } });
        }
    },

    play: async (msg) => {
        try {
            if (!userInVoice(msg, true)) {
                return;
            }

            if (botInVoice(msg, false) && !bothInVoice(msg, true)) {
                return;
            }

            if (!botInVoice(msg, false) && !msg.member.voiceChannel.joinable) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `I do not have permission to join the voice channel.` } });
                return;
            }

            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            let youtube_url = msg.content.split(` `)[1];

            msg.member.voiceChannel.join();

            if (youtube_url == null) {
                // Play music bot if it hasn't. 
                if (musicStopped(msg.guild.id)) {
                    if (queues[0].length < 1) {
                        msg.reply({ embed: { title: `:information_source: Status: Info`, description: `There are no songs in the queue.` } });
                    } else {
                        play(msg, msg.guild.voiceConnection);
                    }
                } else if (musicPaused(msg.guild.id)) {
                    getDispatcher(msg.guild.id).resume();
                } else {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `The music bot is already playing.` } });
                }

                return;
            }

            if (!validUrl.isUri(youtube_url)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid Youtube link.` } });
                return;
            }

            if (youtube_url.includes('list=')) {
                youtube_url = `https://www.youtube.com/playlist?list=${youtube_url.split(`list=`)[1].split(`&`)[0]}`;
            }

            let video_ids = await ytlist(youtube_url, `id`);
            let titles = await ytlist(youtube_url, `name`);

            msg.delete();

            if (video_ids.data.playlist.length > 0 && titles.data.playlist.length > 0) {
                let video_ids_reversed = video_ids.data.playlist.reverse();
                let titles_reversed = titles.data.playlist.reverse();

                let queries = ``;
                let position = 1;

                if (queues[0].length > 0) {
                    position = queues[0][0].position - 1;
                }

                let i = 0;
                video_ids_reversed.forEach(video_id => {
                    queries += mysql.format(`INSERT INTO queues (guild_id, playlist_id, position, title, video_id) VALUES (?, ?, ?, ?, ?);`, [msg.guild.id, currents[0][0].playlist_id, position--, titles_reversed[i++], video_id]);
                });

                await db.query(queries);

                msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `${video_ids.data.playlist.length} songs from the playlist is now playing and has been added to the front of the queue.` } });
            } else {
                if (!ytdl.validateURL(youtube_url)) {
                    msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid Youtube link.` } });
                    return;
                }

                let first_position = 1;

                if (queues[0].length > 1) {
                    first_position = queues[0][0].position;
                }

                let info = await ytdl.getInfo(youtube_url);

                await db.query(`INSERT INTO queues (guild_id, playlist_id, position, title, video_id) VALUES (?, ?, ?, ?, ?)`, [msg.guild.id, currents[0][0].playlist_id, first_position - 1, info.title, info.video_id]);

                msg.reply({
                    embed: {
                        title: info.title,
                        description: `:white_check_mark: Status: Success \n\n **${info.title}** is now playing and has been added to the queue.`,
                        url: info.video_url,
                        thumbnail: {
                            url: info.thumbnail_url
                        }
                    }
                });
            }

            if (musicStopped(msg.guild.id)) {
                play(msg, msg.guild.voiceConnection);
            } else {
                getDispatcher(msg.guild.id).end();
            }
        } catch (err) {
            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The music bot may not be playing and may not have added any songs to the queue.` } });

            log(`Database error when trying to add and play songs.\nWhere: 'play' function in commands.js\nError Message: ${err.message}`);
        }
    },

    playnow: async (msg) => {
        try {
            let currents = await db.query(`SELECT playlists.playlist_id, playlists.name FROM currents JOIN playlists ON playlists.playlist_id = currents.playlist_id AND currents.guild_id = ? AND playlists.guild_id = ?;`, [msg.guild.id, msg.guild.id]);
            let queues = await db.query(`SELECT * FROM queues WHERE guild_id = ? AND playlist_id = ? ORDER BY position`, [msg.guild.id, currents[0][0].playlist_id]);

            let queue_num = parseInt(msg.content.split(' ')[1]);

            if (!Number.isInteger(queue_num)) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `Invalid queue number.` } });
                return;
            }

            if (queues[0][--queue_num] === undefined) {
                msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `That queue number does not exist. Type **;queue** for the list of queue numbers.` } });
                return;
            }

            let first_queue_pos = queues[0][0].position;

            await db.query(`UPDATE queues SET position = ? WHERE id = ?`, [first_queue_pos - 1, queues[0][queue_num].id]);

            msg.reply({ embed: { title: `:white_check_mark: Status: Success`, description: `**[${queues[0][queue_num].title}](https://www.youtube.com/watch?v=${queues[0][queue_num].video_id})** is now playing.` } });

            if (musicStopped(msg.guild.id)) {
                play(msg, msg.guild.voiceConnection);
            } else {
                getDispatcher(msg.guild.id).end(`SKIP`);
            }
        } catch (err) {
            log(`Database error when trying to play song from queue now.\nWhere: 'playnow' function in commands.js\nError Message: ${err.message}`);

            msg.reply({ embed: { title: `:regional_indicator_x: Status: Error`, description: `A database error has occured. The selected song from the queue failed to play.` } });
        }
    },

    stop: (msg) => {
        if (userInVoice(msg, true) && botInVoice(msg, true) && bothInVoice(msg, true)) {
            if (musicStopped(msg.guild.id)) {
                msg.member.voiceChannel.leave();
            } else {
                getDispatcher(msg.guild.id).end(`STOP`);
            }
        }
    }
};