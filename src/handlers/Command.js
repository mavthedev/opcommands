const Discord = require("discord.js");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const hms = require("humanize-ms");
const ms = require("ms");
const fs = require("fs");
const path = require("path");
const { time } = require("console");
/**
 * Command Handler
 * @class
 * @param {*} _this
 * @param {String} commandsDir
 */
class CommandHandler {
    constructor (_this, commandsDir) {
        if (!this) throw new Error("[OPCommands] Internal error: missing _this parameter on Command Handler.");
        if (!commandsDir) throw new Error("[OPCommands] Internal error: missing eventsDir parameter on Command Handler.");
        if (_this.options.notifyOwner && !_this.options.notifyOwnerMessage) throw new Error("[OPCommands] Missing notifyOwnerMessage parameter on options.");
        if (!fs.existsSync(commandsDir)) throw new Error("[OPCommands] Unexisting command directory.");

        _this.client.commands = new Discord.Collection();
        const files = fs.readdirSync(commandsDir).filter(file => file.endsWith(".js"));
        const commands = [];

        if (_this.options.logs) console.log("[OPCommands] Loaded " + files.length + " commands.");
        for (const file of files) {
            const commandFile = require(path.join(require.main.path, commandsDir, file));
            _this.client.commands.set(commandFile.name, commandFile);
            const commandObj = {
                name: commandFile.name.toLowerCase(),
                description: commandFile.description
            };
            if (commandFile.options) Object.assign(commandObj, {options: commandFile.options});
            commands.push(JSON.stringify(commandObj));
        };
        _this.client.on("ready", async () => {
            const rest = new REST({ version: "9" }).setToken(_this.client.token);
            if (_this.options.notifyOwner && !_this.client.msgs.notifyOwnerMessage) throw new Error("[OPCommands] Missing notifyOwnerMessage parameter.");
            if(_this.options.notifyOwner) {
                const users = []
                for(let id of _this.client.owners) {
                    users.push(await _this.client.users.fetch(id));
                }
                if (_this.client.msgs.notifyOwnerMessage) {
                    for(let user of users) {
                        _this.client.msgs.notifyOwnerMessage(user); 
                    }
                  } else {
                    // if there isn't any message, it uses a default one
                    for(let user of users) {
                        user.createDM();
                        user.send("I'm online!");
                    }
                  };
            }
            if (_this.options.testMode === true) {
                if (!_this.options.testGuildID) throw new Error("[OPCommands] Invalid or missing 'testGuildID' option in main class.");
                (async () => {
                    try {
                        await rest.put(
                            Routes.applicationGuildCommands(_this.client.application?.id, _this.options.testGuildID),
                            { body: _this.client.commands }
                        )
                    } catch (error) {
                        console.error(error);
                    }
                })();
            } else {
                (async () => {
                    try {
                        await rest.put(
                            Routes.applicationCommands(_this.client.application?.id),
                            { body: _this.client.commands },
                        );
                    } catch (error) {
                        console.error(error);
                    }
                })();
            }
        });

        const cooldowns = new Discord.Collection();
        _this.client.on("interactionCreate", (interaction) => {
            if (!interaction.isCommand()) return;
            if (!_this.client.commands.has(interaction.commandName)) return;
            const commandFile = _this.client.commands.get(interaction.commandName);
            if (commandFile.limits.owner && !_this.client.owners.includes(interaction.user.id)) {
                const ownerOnly = _this.client.msgs.ownerOnly;
                if (ownerOnly) {
                    return ownerOnly(interaction);
                } else {
                    return interaction.reply({ content: "You must be a Bot Owner to execute this command!", ephemeral: true });
                };
            };
            if (commandFile.limits.permissions && !interaction.member?.permissions.has(commandFile.limits.permissions)) {
                const permissions = _this.client.msgs.permissions;
                if (permissions) {
                    return permissions(interaction, commandFile.limits.permissions);
                } else {
                    return interaction.reply({ content: "You must have the following permissions: " + commandFile.limits.permissions.join(", "), ephemeral: true });
                };
            };
            hascooldown: if (!cooldowns.has(`${commandFile.name}_${interaction.user.id}`)) {
                if (!commandFile.limits.cooldown) break hascooldown;
                cooldowns.set(`${commandFile.name}_${interaction.user.id}`, Date.now());
                setTimeout(() => {cooldowns.delete(`${commandFile.name}_${interaction.user.id}`)}, hms(commandFile.limits.cooldown))
            } else {
                const expirationTime = cooldowns.get(`${commandFile.name}_${interaction.user.id}`) + hms(commandFile.limits.cooldown);
                if (Date.now() < expirationTime) {
                    const timeLeft = ms(expirationTime - Date.now());
                    const cooldown = _this.client.msgs.cooldown;
                    if (cooldown) {
                        return cooldown(interaction, timeLeft);
                    } else {
                        return interaction.reply({ content: `You are in a cooldown! Please wait **${timeLeft}**.`, ephemeral: true });
                    };
                };
            };

            try {
                if (_this.options.logs) console.log(`[OPCommands] Command '${interaction.commandName}' executed by: '${interaction.user.tag}'`);
                commandFile.run(_this.client, interaction);
                if (_this.options.notifyOwner && (commandFile.limits.permissions == ('ADMINISTRATOR').toLowerCase())) {
                    _this.client.users.fetch(_this.client.owners[0]).then(user => {
                        user.send("[Logs] Administrator command `" + interaction.commandName + "` was executed by " + `<@${interaction.user.id}> in **${interaction.guild.name}**`);
                    });
                }
            } catch (e) {
                if (_this.options.logs) console.log("[OPCommands] Command error: " + interaction.commandName);
                console.error(e);
            }
        });
    }
}

module.exports = CommandHandler;
