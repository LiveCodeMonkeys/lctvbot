'use strict'
var channels = [];
var config = require( './config.json' );

var lctvbot = require( "lctvbot" );
var mysql = require( 'mysql' );
var bot = new lctvbot( config );
var vm = require( 'vm' );
var util = require( 'util' );
var channelCount = 0;
var lastServerCommandCheck = null;
var online;

var con = mysql.createConnection( {
    host: 'localhost',
    user: 'lctvbot',
    password: 'KaSOtIT5nu',
    database: 'lctvbot'
} );

con.connect();
console.log( "Loading channel commands into the bot" );
con.query( "SELECT name FROM channels", function( err, rows, fields ) {
    console.log( "ROWS: " + rows.length );
    for( var x = 0; x < rows.length; x++ ) {
        channels[ rows[x].name ] = { commands: [], name: rows[x].name };
        console.log( rows[x].name );
        console.log( channels[ rows[x].name ].name );
    }

    loadCommands();
} );

bot.on( 'online', function( data ) {
    online = unixTimestamp();
    console.log( "LCTVBot Online ");
    console.log( channels.length );
    for( var name in channels ) {
        bot.join( channels[name].name );
        channelCount++;
    }
    setInterval( serverCommands, 5000 );
} );


bot.on( 'error', function( e ) {
    console.error( e.toString() );
} );

bot.on( 'msg', function( nickname, channel, message, stanza ) {
    var tmp = message.split( " " );
    for( var trigger in channels[channel].commands ) {
        if( trigger == tmp[0] ) {
            //Check access
            var command = channels[channel].commands[trigger];
            if( command.access == 'mod' && bot.channels[channel].mods.indexOf( nickname ) > -1 ) {
                executeCommand( command, channel, nickname, tmp );
            }
            else {
                executeCommand( command, channel, nickname, tmp );
            }
            break;
        }
    }
} );

//Commands
bot.on( 'command#!debug', function( from, text, stanza ) {
    var channel = bot.channels [ from ];
    console.log( channel );
    bot.message( from, "Total Users: " + ( channel.users.length + channel.mods.length ), stanza.type );
    bot.message( from, "Users: " + channel.users.length, stanza.type );
    bot.message( from, "Mods: " + channel.mods.length, stanza.type );
} );

bot.on( 'command#!help', function( from, text, stanza ) {
    var string = [];
    for( var trigger in channels[from].commands ) {
        string.push( trigger );
    }
    bot.message( from, "LCTV Bot Commands:", stanza.type );
    bot.message( from, "Global Commands: !help, !info", stanza.type );
    bot.message( from, "Channel commands: " + string.join( ',' ), stanza.type );
} );

bot.on( 'command#!info', function( from, text, stanza ) {
    var onlineTimer = unixTimestamp() - online;
    console.log( { channelCount: channelCount, onlineTimer: onlineTimer } );
    bot.message( from, "LCTV Bot Info:", stanza.type );
    bot.message( from, "Channels: " + channelCount, stanza.type );
    bot.message( from, "Online: " + onlineTimer + "s", stanza.type );
} );

bot.on( 'command#!reload' , function( from, text, stanza ) {
    bot.message( from, 'Reloading chat commands...', stanza.type );
    loadCommands( from );
} );


//Functions
var random = function( min, max ) {
    return Math.floor( Math.random() * (max - min) ) + min;
}

var loadCommands = function( channel ) {
    var query = null;
    console.log( channel );
    if( channel ) {
        query = "SELECT name as `channel`, `trigger`, `content`, `access`, `type` FROM channel_commands cm INNER JOIN channels c ON cm.channel = c.id WHERE c.name = '" + channel + "' ORDER BY c.name";
    }
    else {
        query = "SELECT name as `channel`, `trigger`, `content`, `access`, `type` FROM channel_commands cm INNER JOIN channels c ON cm.channel = c.id ORDER BY c.name";
    }
    console.log( "Loading commands..." );
    //Load all the commands
    con.query( query, function( err, rows, fields ) {
        for( var x = 0; x < rows.length; x++ ) {
            channels[ rows[x].channel ].commands[rows[x].trigger] = { content: rows[x].content, access: rows[x].access, type: rows[x].type };
        }
    } );
};

var unixTimestamp = function() {
    return Math.floor( Date.now() / 1000 );
}

var executeCommand = function( command, channel, nickname, message ) {
    console.log( 'In executeCommand' );
    console.log( command );
    switch( command.type ) {
        case "text":
            bot.message( channel, command.content, 'groupchat' );
            break;
        case "command":
            var context = {
                channel: channel,
                nickname: nickname,
                message: message,
                result: null
            };
            console.log( command.content );
            try {
                //vm.runInNewContext( command.content, context );
                var script = vm.createScript( command.content );
                script.runInNewContext( context );
                bot.message( channel, context.result, 'groupchat' );
            }
            catch( e ) {
                console.log( e );
            }
    }
}

var serverCommands = function() {
    console.log( 'Checking for server commands.....' );
    console.log( { lastcheck: lastServerCommandCheck } );
    //Check the server to see if I need to execute any new commands
    var query = "SELECT `command`, `params` FROM server_commands WHERE ran = 0 ORDER BY date";
    lastServerCommandCheck = unixTimestamp();
    con.query( query, function( err, rows, fields ) {
        if( !err ) {
            for( var x = 0; x < rows.length; x++ ) {
                var command = rows[x].command;
                var params = JSON.parse( rows[x].params );
                switch( command ) {
                    case "reload_commands":
                        loadCommands( params.channel );
                        break;
                    case "join":
                        bot.join( params.channel );
                        break;
                    case "part":
                        bot.part( params.channel );
                        break;
                }
            }
        }
        con.query( "UPDATE server_commands SET ran = 1 WHERE ran = 0 AND date < " + lastServerCommandCheck );
    } );
};
