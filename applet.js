const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
//const DBus = imports.dbus;
const Lang = imports.lang;

const ENTRIES = [
    { id: "logOff", title: "Log Off" },
    { id: "restart", title: "Restart" },
    { id: "shutDown", title: "Shut Down" },
    { id: "hibernate", title: "Hibernate" },
    { id: "suspend", title: "Suspend" }
];


let menu_item_icon_size, menu_item_icon_type, has_console_kit, has_upower;


CommandDispatcher = {
    shutDown: function() {
        if ( has_console_kit ) Util.spawnCommandLine("dbus-send --system --print-reply --system --dest=org.freedesktop.ConsoleKit /org/freedesktop/ConsoleKit/Manager org.freedesktop.ConsoleKit.Manager.Stop");
        else if ( has_systemd ) Util.spawnCommandLine("systemctl poweroff");
    },
    
    restart: function() {
        Util.spawnCommandLine("dbus-send --system --print-reply --system --dest=org.freedesktop.ConsoleKit /org/freedesktop/ConsoleKit/Manager org.freedesktop.ConsoleKit.Manager.Restart");
    },
    
    logOff: function() {
        Util.spawnCommandLine("dbus-send --session --type=method_call --print-reply --dest=org.gnome.SessionManager /org/gnome/SessionManager org.gnome.SessionManager.Logout uint32:1");
    },
    
    suspend: function() {
        Util.spawnCommandLine("dbus-send --print-reply --system --dest=org.freedesktop.UPower /org/freedesktop/UPower org.freedesktop.UPower.Suspend");
    },
    
    hibernate: function() {
        Util.spawnCommandLine("dbus-send --print-reply --system --dest=org.freedesktop.UPower /org/freedesktop/UPower org.freedesktop.UPower.Hibernate");
    }
}


function MenuItem(info, params) {
    this._init(info, params);
}

MenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,
    
    _init: function(info, params) {
        try {
            
            this.id = info.id;
            
            PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
            
            //this.command = command;
            //this.addActor(this.getIcon());
            
            let label = new St.Label({ text: info.title });
            this.addActor(label);
            this.actor._delegate = this;
            
        } catch (e){
            global.logError(e);
        }
    },
    
    getIcon: function(iconString) {
        if ( iconString.split("/").length > 1 ) {
            return null;
        }
        else {
            return new St.Icon({ icon_name: iconString, icon_size: menu_item_icon_size, icon_type: menu_item_icon_type });
        }
    },
    
    activate: function() {
try {
    CommandDispatcher[this.id]();
} catch (e) {
    global.logError(e);
}
    }
}


function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,
    
    _init: function(metadata, orientation, panel_height, instanceId) {
        try {
            
            this.metadata = metadata;
            this.instanceId = instanceId;
            this.orientation = orientation;
            Applet.TextIconApplet.prototype._init.call(this, this.orientation, panel_height);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            
            this._checkSession();
            
            //initiate settings
            this._bindSettings();
            this.buildMenu();
            
            //set up panel
            this._set_panel_icon();
            this._set_panel_text();
            this.set_applet_tooltip(_("Session"));
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    on_applet_clicked: function(event) {
        this.menu.toggle();
    },
    
    _checkSession: function() {
        //check if ConsoleKit is running
        let [a, output] = GLib.spawn_command_line_sync("ps -C console-kit-dae");
        if ( String(output).split("\n").length > 2 ) has_console_kit = true;
        
        //check if UPower is running
        let [a, output] = GLib.spawn_command_line_sync("ps -C upowerd");
        if ( String(output).split("\n").length > 2 ) has_upower = true;
        
        //check if systemd is being used
        let [a, output] = GLib.spawn_command_line_sync("ps -C systemd");
        if ( String(output).split("\n").length > 2 ) has_systemd = true;
        
        //check session manager
        
    },
    
    _bindSettings: function() {
        this.settings = new Settings.AppletSettings(this, this.metadata["uuid"], this.instanceId);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panelIcon", "panelIcon", this._set_panel_icon);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panelText", "panelText", this._set_panel_text);
        this.settings.bindProperty(Settings.BindingDirection.IN, "iconSize", "iconSize", this.buildMenu);
        this.settings.bindProperty(Settings.BindingDirection.IN, "symbolic", "symbolic", this.buildMenu);
        //for ( let i = 0; i < ENTRIES.length; i++ ) {
        //    this.settings.bindProperty(Settings.BindingDirection.IN, ENTRIES[i].id+"Show", ENTRIES[i].id+"Show", this.buildMenu);
        //    this.settings.bindProperty(Settings.BindingDirection.IN, ENTRIES[i].id+"Icon", ENTRIES[i].id+"Icon", this.buildMenu);
        //    this.settings.bindProperty(Settings.BindingDirection.IN, ENTRIES[i].id+"Command", ENTRIES[i].id+"Command", this.buildMenu);
        //}
        //this._setKeybinding();
    },
    
    buildMenu: function() {
        try {
            
            if ( this.menu ) this.menu.destroy();
            
            menu_item_icon_size = this.iconSize;
            if ( this.symbolic ) menu_item_icon_type = St.IconType.SYMBOLIC;
            else menu_item_icon_type = St.IconType.FULLCOLOR;
            
            this.menu = new Applet.AppletPopupMenu(this, this.orientation);
            this.menuManager.addMenu(this.menu);
            
            for ( let i = 0; i < ENTRIES.length; i++ ) {
                let menuItem = new MenuItem(ENTRIES[i]);
                this.menu.addMenuItem(menuItem);
            }
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    _set_panel_icon: function() {
        if ( this.panelIcon.split("/").length > 1 ) this.set_applet_icon_path(this.panelIcon);
        else this.set_applet_icon_symbolic_name(this.panelIcon);
    },
    
    _set_panel_text: function() {
        if ( this.panelText ) this.set_applet_label(this.panelText);
        else this.set_applet_label("");
    }
}


function main(metadata, orientation, panel_height, instanceId) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}