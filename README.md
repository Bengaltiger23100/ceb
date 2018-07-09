# Discord-Music-Bot
An advanced Discord music bot created using Node.js and MySQL. Fully functional out-of-the-box. 

## Features
* Queue and playlist system.
* Supports unlimited guilds. 
* Saves the queue, song queue positions, and playlist in real-time. 
* All the data is stored and retrieved from the MySQL database.
* All music bot features are fully functional out-of-the-box.
* Error logging.


## Required Configurations
In *app.js*, replace **BOT_TOKEN** with your Discord bot token.

In *db.js*, replace the database configurations to connect to your database.

Use *database.sql* to set up the database structure. 

## How To Run
Simply do:

```
node app
```

or use the [forever](https://www.npmjs.com/package/forever) module to run the bot continously.

## Commands
```
;play  or  ;play <Youtube URL> - Adds songs to the front of the queue and plays it immediately.
;add <Youtube URL> - Adds songs to the back of the queue.
;np  or  ;nowplaying - Gets the current playing song's info.
;queue or ;queue <Page Number> - Lists the queue and its queue numbers.
;swap <Queue Number> <Queue Number> - Swaps the position of the songs in the queue.
;playnow <Queue Number> - Immediately plays the song from the queue.
;clear - Clears the queue.
;removesong <Queue Number> - Removes the song from the queue.
;createplaylist <Playlist Name> - Creates a playlist.
;removeplaylist <Playlist Number> - Removes the playlist.
;setplaylist <Playlist Number> - Sets the current playlist.
;listplaylists  or  ;listplaylists <Page Number> - Lists the playlists and its playlist numbers.
;currentplaylist - Shows the current set playlist name.
;renameplaylist <New Playlist Name> - Renames the currently set playlist.
;removeduplicates - Removes duplicate songs in the queue.
;deleteonplay - If enabled, played songs are removed from the queue.
;loop - Enable or disable song loops.
;skip - Skips the current song.
;stop - Stops the music bot.
;pause - Pauses the music bot.
;resume - Resumes the music bot.
;shuffle - Shuffles the queue.
;join - Music bot joins the voice channel.
;leave - Music bot leaves the voice channel.
```
