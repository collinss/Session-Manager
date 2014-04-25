const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const ScreenSaver = imports.misc.screenSaver;
const Util = imports.misc.util;
const Lang = imports.lang;


let button_path, menu_item_icon_size, use_symbolic_icons;
let has_console_kit, has_upower, has_systemd, session_manager;

let CommandDispatcher = {
    shutDown: function() {
        if ( has_console_kit ) Util.spawnCommandLine("dbus-send --system --print-reply --system --dest=org.freedesktop.ConsoleKit /org/freedesktop/ConsoleKit/Manager org.freedesktop.ConsoleKit.Manager.Stop");
        else if ( has_systemd ) Util.spawnCommandLine("systemctl poweroff");
    },
    
    restart: function() {
        if ( has_console_kit ) Util.spawnCommandLine("dbus-send --system --print-reply --system --dest=org.freedesktop.ConsoleKit /org/freedesktop/ConsoleKit/Manager org.freedesktop.ConsoleKit.Manager.Restart");
        else if ( has_systemd ) Util.spawnCommandLine("systemctl reboot");
    },
    
    hibernate: function() {
        if ( has_upower ) Util.spawnCommandLine("dbus-send --print-reply --system --dest=org.freedesktop.UPower /org/freedesktop/UPower org.freedesktop.UPower.Hibernate");
        else if ( has_systemd ) Util.spawnCommandLine("systemctl hibernate");
    },
    
    suspend: function() {
        if ( has_upower ) Util.spawnCommandLine("dbus-send --print-reply --system --dest=org.freedesktop.UPower /org/freedesktop/UPower org.freedesktop.UPower.Suspend");
        else if ( has_systemd ) Util.spawnCommandLine("systemctl suspend");
    },
    
    sleep: function() {
        if ( has_systemd ) Util.spawnCommandLine("systemctl hybrid-sleep");
    },
    
    logOff: function() {
        Util.spawnCommandLine("dbus-send --session --type=method_call --print-reply --dest=org.gnome.SessionManager /org/gnome/SessionManager org.gnome.SessionManager.Logout uint32:1");
    },
    
    uSwitch: function() {
        switch ( session_manager ) {
            case 0: //lightdm
                Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                Util.spawnCommandLine("dm-tool switch-to-greeter");
                break;
            case 1: //mdm
                Util.spawnCommandLine("mdmflexiserver");
                break;
            case 2: //gdm
                Util.spawnCommandLine("cinnamon-screensaver-command --lock");
                Util.spawnCommandLine("gdmflexiserver");
                break;
        }
    },
    
    guest: function() {
        if ( session_manager == 0 ) {
            Util.spawnCommandLine("cinnamon-screensaver-command --lock");
            Util.spawnCommandLine("dm-tool switch-to-guest");
        }
    },
    
    lock: function() {
        this._screenSaverProxy = new ScreenSaver.ScreenSaverProxy();
        let screensaver_settings = new Gio.Settings({ schema: "org.cinnamon.screensaver" });
        let screensaver_dialog = Gio.file_new_for_path("/usr/bin/cinnamon-screensaver-command");
        if ( screensaver_dialog.query_exists(null) ) {
            if ( screensaver_settings.get_boolean("ask-for-away-message") ) Util.spawnCommandLine("cinnamon-screensaver-lock-dialog");
            else Util.spawnCommandLine("cinnamon-screensaver-command --lock");
        }
        else this._screenSaverProxy.LockRemote();
    }
}


function MenuItem(menu, info, params) {
    this._init(menu, info, params);
}

MenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,
    
    _init: function(menu, info, params) {
        try {
            
            this.menu = menu;
            this.id = info.id;
            
            PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
            
            this.addActor(this.getIcon());
            
            let label = new St.Label({ text: info.title });
            this.addActor(label);
            this.actor._delegate = this;
            
        } catch (e){
            global.logError(e);
        }
    },
    
    getIcon: function() {
        let iconType, iconPath;
        if ( use_symbolic_icons ) {
            iconPath = button_path + this.id + "-symbolic.svg";
            iconType = St.IconType.SYMBOLIC;
        }
        else {
            iconPath = button_path + this.id + ".svg";
            iconType = St.IconType.FULLCOLOR;
        }
        
        let file = Gio.file_new_for_path(iconPath);
        let gicon = new Gio.FileIcon({ file: file });
        let icon = new St.Icon({ gicon: gicon, icon_size: menu_item_icon_size, icon_type: iconType });
        
        return icon;
    },
    
    activate: function() {
        try {
            this.menu.close();
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
            button_path = metadata.path + "/buttons/";
            Applet.TextIconApplet.prototype._init.call(this, this.orientation, panel_height);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, this.orientation);
            this.menuManager.addMenu(this.menu);
            
            this._checkSession();
            
            //initiate settings
            this._bindSettings();
            this.buildMenu();
            
            //set up panel
            this.setPanelIcon();
            this.setPanelText();
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
        if ( GLib.getenv("XDG_SEAT_PATH") ) session_manager = 0;
        else if ( GLib.file_test("/usr/bin/mdmflexiserver", GLib.FileTest.EXISTS) ) session_manager = 1;
        else if ( GLib.file_test("/usr/bin/gdmflexiserver", GLib.FileTest.EXISTS) ) session_manager = 2;
    },
    
    _bindSettings: function() {
        this.settings = new Settings.AppletSettings(this, this.metadata.uuid, this.instanceId);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panelIcon", "panelIcon", this.setPanelIcon);
        this.settings.bindProperty(Settings.BindingDirection.IN, "symbolicPanelIcon", "symbolicPanelIcon", this.setPanelIcon);
        this.settings.bindProperty(Settings.BindingDirection.IN, "panelText", "panelText", this.setPanelText);
        this.settings.bindProperty(Settings.BindingDirection.IN, "iconSize", "iconSize", this.buildMenu);
        this.settings.bindProperty(Settings.BindingDirection.IN, "symbolicMenuIcons", "symbolicMenuIcons", this.buildMenu);
    },
    
    buildMenu: function() {
        try {
            
            this.menu.removeAll();
            
            menu_item_icon_size = this.iconSize;
            use_symbolic_icons = this.symbolicMenuIcons;
            
            //lock
            let lock = new MenuItem(this.menu, { id: "lock", title: "Lock Screen" });
            this.menu.addMenuItem(lock);
            
            //switch user
            let uSwitch = new MenuItem(this.menu, { id: "uSwitch", title: "Switch User" });
            this.menu.addMenuItem(uSwitch);
            
            //guest
            if ( session_manager == 0 ) {
                let guest = new MenuItem(this.menu, { id: "guest", title: "Guest Session" });
                this.menu.addMenuItem(guest);
            }
            
            //log off
            let logOff = new MenuItem(this.menu, { id: "logOff", title: "Log Off" });
            this.menu.addMenuItem(logOff);
            
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            //suspend
            let suspend = new MenuItem(this.menu, { id: "suspend", title: "Suspend" });
            this.menu.addMenuItem(suspend);
            
            //sleep
            if ( has_systemd ) {
                let sleep = new MenuItem(this.menu, { id: "sleep", title: "Sleep" });
                this.menu.addMenuItem(sleep);
            }
            
            //hibernate
            let hibernate = new MenuItem(this.menu, { id: "hibernate", title: "Hibernate" });
            this.menu.addMenuItem(hibernate);
            
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            //restart
            let restart = new MenuItem(this.menu, { id: "restart", title: "Restart" });
            this.menu.addMenuItem(restart);
            
            //shut down
            let shutDown = new MenuItem(this.menu, { id: "shutDown", title: "Shut Down" });
            this.menu.addMenuItem(shutDown);
            
        } catch(e) {
            global.logError(e);
        }
    },
    
    setPanelIcon: function() {
        if ( this.panelIcon.split("/").length > 1 ) {
            if ( this.symbolicPanelIcon && this.panelIcon.search("-symbolic.svg") > 0 ) this.set_applet_icon_symbolic_path(this.panelIcon);
            else this.set_applet_icon_path(this.panelIcon);
        }
        else {
            if ( this.symbolicPanelIcon ) this.set_applet_icon_symbolic_name(this.panelIcon);
            else this.set_applet_icon_name(this.panelIcon);
        }
    },
    
    setPanelText: function() {
        if ( this.panelText ) this.set_applet_label(this.panelText);
        else this.set_applet_label("");
    },
    
    set_applet_icon_symbolic_path: function(icon_path) {
        if (this._applet_icon_box.child) this._applet_icon_box.child.destroy();
        
        if (icon_path){
            let file = Gio.file_new_for_path(icon_path);
            let gicon = new Gio.FileIcon({ file: file });
            if (this._scaleMode) {
                let height = (this._panelHeight / DEFAULT_PANEL_HEIGHT) * PANEL_SYMBOLIC_ICON_DEFAULT_HEIGHT;
                this._applet_icon = new St.Icon({gicon: gicon, icon_size: height,
                                                icon_type: St.IconType.SYMBOLIC, reactive: true, track_hover: true, style_class: 'applet-icon' });
            } else {
                this._applet_icon = new St.Icon({gicon: gicon, icon_size: 22, icon_type: St.IconType.FULLCOLOR, reactive: true, track_hover: true, style_class: 'applet-icon' });
            }
            this._applet_icon_box.child = this._applet_icon;
        }
        this.__icon_type = -1;
        this.__icon_name = icon_path;
    }
}


function main(metadata, orientation, panel_height, instanceId) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}