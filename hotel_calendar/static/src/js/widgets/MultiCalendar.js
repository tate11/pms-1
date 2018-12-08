// Copyright 2018 Alexandre Díaz <dev@redneboa.es>
// License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).
odoo.define('hotel_calendar.MultiCalendar', function(require) {
  'use strict';

  var core = require('web.core');
  var session = require('web.session');
  var Widget = require('web.Widget');
  var HotelConstants = require('hotel_calendar.Constants');

  var QWeb = core.qweb;

  var MultiCalendar = Widget.extend({
    _calendars: [],
    _active_index: -1,
    _events: {},
    _tabs: [],
    _dataset: {},
    _base: null,


    init: function(parent) {
      this._super.apply(this, arguments);
    },

    start: function() {
      this._super.apply(this, arguments);

      this._create_tabs_panel();
    },

    get_calendar: function(index) {
      return this._calendars[index-1];
    },

    get_tab: function(index) {
      return this._tabs[index];
    },

    get_active_index: function() {
      return this._active_index;
    },

    get_active_calendar: function() {
      return this._calendars[this._active_index-1];
    },

    get_active_tab: function() {
      return this._tabs[this._active_index];
    },

    recalculate_reservation_positions: function() {
      var active_calendar = this.get_active_calendar();
      if (active_calendar) {
        setTimeout(function(calendar){
          for (var reserv of calendar._reservations) {
            var style = window.getComputedStyle(reserv._html, null);
            if (parseInt(style.width, 10) < 15 || parseInt(style.height, 10) < 15 || parseInt(style.top, 10) === 0) {
              this.get_active_calendar()._updateReservation(reserv);
            }
          }
        }.bind(this, active_calendar), 200);
      }
    },

    remove_reservation: function(reserv_id) {
      for (var calendar of this._calendars) {
        calendar.removeReservation(reserv['reserv_id']);
      }
    },

    replace_reservation: function(newReserv, oldReserv) {
      for (var calendar of this._calendars) {
        calendar.replaceReservation(newReserv, oldReserv);
      }
    },

    remove_obroom_row: function(reserv) {
      for (var calendar of this._calendars) {
        calendar.removeOBRoomRow(reserv);
      }
    },

    swap_reservations: function(outReservs, inReservs) {
      for (var calendar of this._calendars) {
        calendar.swapReservations(outReservs, inReservs);
      }
    },

    set_active_calendar: function(index) {
      this._tabs[index+1][0].tab('show');
    },

    set_datasets: function(pricelist, restrictions, reservations) {
      this._dataset = {
        pricelist: pricelist,
        restrictions: restrictions,
        reservations: reservations,
      };
    },

    set_options: function(options) {
      this._options = options;
    },

    set_base_element: function(element) {
      this._base = element;
    },

    merge_pricelist: function(pricelist) {
      var keys = _.keys(pricelist);
      for (var k of keys) {
        var pr = pricelist[k];
        for (var pr_k in pr) {
          var pr_item = pricelist[k][pr_k];
          var pr_fk = _.findKey(this._dataset['pricelist'][k], {'room': pr_item.room});
          if (pr_fk) {
            this._dataset['pricelist'][k][pr_fk].room = pr_item.room;
            this._dataset['pricelist'][k][pr_fk].days = _.extend(this._dataset['pricelist'][k][pr_fk].days, pr_item.days);
            if (pr_item.title) {
              this._dataset['pricelist'][k][pr_fk].title = pr_item.title;
            }
          } else {
            if (!(k in this._dataset['pricelist'])) {
              this._dataset['pricelist'][k] = [];
            }
            this._dataset['pricelist'][k].push({
              'room': pr_item.room,
              'days': pr_item.days,
              'title': pr_item.title
            });
          }
        }
      }

      for (var calendar of this._calendars) {
        calendar.setPricelist(this._dataset['pricelist']);
      }
    },

    merge_restrictions: function(restrictions) {
      var room_type_ids = Object.keys(restrictions);
      for (var vid of room_type_ids) {
        if (vid in this._dataset['restrictions']) {
          this._dataset['restrictions'][vid] = _.extend(this._dataset['restrictions'][vid], restrictions[vid]);
        }
        else {
          this._dataset['restrictions'][vid] = restrictions[vid];
        }
      }

      for (var calendar of this._calendars) {
        calendar.setRestrictions(this._dataset['restrictions']);
      }
    },

    merge_reservations: function(reservations) {
      for (var r of reservations) {
        var rindex = _.findKey(this._dataset['reservations'], {'id': r.id});
        if (rindex) {
          this._dataset['reservations'][rindex] = r;
        } else {
          this._dataset['reservations'].push(r);
        }
      }

      for (var calendar of this._calendars) {
        calendar.addReservations(this._dataset['reservations']);
      }
    },

    merge_days_tooltips: function(new_tooltips) {
      for (var nt of new_tooltips) {
        var fnt = _.find(this._days_tooltips, function(item) { return item[0] === nt[0]});
        if (fnt) {
          fnt = nt;
        } else {
          this._days_tooltips.push(nt);
        }
      }
    },

    create_calendar: function(name) {
      var [$tab, $panel] = this._create_tab(name, `calendar-pane-${name}`);
      var calendar = new HotelCalendar(
          $panel[0],
          this._options,
          this._dataset['pricelist'],
          this._dataset['restrictions'],
          this._base);
      this._assign_calendar_events(calendar);
      this._assign_extra_info(calendar);
      calendar.setReservations(this._dataset['reservations']);
      this._calendars.push(calendar);
      return this._calendars.length-1;
    },

    on: function(event_name, callback) {
      this._events[event_name] = callback;
    },


    _create_tab: function(name, id, options) {
      var self = this;
      var sanitized_id = this._sanitizeId(id);

      var $tab = $('<a/>', _.extend({
        id: this._sanitizeId(name),
        href: `#${sanitized_id}`,
        text: name,
        role: 'tab',
      }, options)).data('tabindex', this._tabs.length).appendTo($('<li/>').prependTo(this.$tabs));
      $tab.on('shown.bs.tab', function(ev){
        self._active_index = $(ev.target).data('tabindex');
        self.recalculate_reservation_positions();
        if (ev.relatedTarget) {
          var prev_index = $(ev.relatedTarget).data('tabindex');
          if (prev_index) {
            self.get_calendar(prev_index).cancelSwap();
          }
        }
      });
      $tab[0].dataset.toggle = 'tab';
      var $panel = $('<div/>', {
        id: sanitized_id,
        class: 'tab-pane',
        role: 'tabpanel'
      }).appendTo(this.$tabs_content);

      this._tabs.push([$tab, $panel]);
      return this._tabs[this._tabs.length-1];
    },

    _create_tabs_panel: function() {
      var self = this;
      this.$el.empty();
      this.$tabs = $('<ul/>', {
        class: 'nav nav-tabs',
      }).appendTo(this.$el);
      this.$tabs_content = $('<div/>', {
        class: 'tab-content',
      }).appendTo(this.$el);

      // '+' Tab
      var [$tab, $panel] = this._create_tab('+', 'default', {class: 'multi-calendar-tab-plus'});
      $tab.on('shown.bs.tab', function(ev){
        ev.preventDefault();
        var new_calendar_id = self.create_calendar(`Calendar #${self._calendars.length}`);
        self.set_active_calendar(new_calendar_id);
      });
      $('<p/>', {
        class: 'warn-message',
        text: "NO CALENDAR DEFINED!",
      }).appendTo($panel);
    },

    _assign_calendar_events: function(calendar) {
      for (var event_name in this._events) {
        calendar.addEventListener(event_name, this._events[event_name]);
      }
    },

    _assign_extra_info: function(calendar) {
    	var self = this;
      $(calendar.etable).find('.hcal-cell-room-type-group-item.btn-hcal-3d').on("mouseenter", function(){
          var $this = $(this);
          var room = calendar.getRoom($this.parent().data("hcalRoomObjId"));
          if (room.overbooking) {
            $this.tooltip({
                animation: true,
                html: true,
                placement: 'right',
                title: QWeb.render('HotelCalendar.TooltipRoomOverbooking', {'name': room.number})
            }).tooltip('show');
          return;
        } else {
            var qdict = {
                'room_type_name': room.getUserData('room_type_name'),
                'name': room.number
            };
            $this.tooltip({
                animation: true,
                html: true,
                placement: 'right',
                title: QWeb.render('HotelCalendar.TooltipRoom', qdict)
            }).tooltip('show');
        }
      });

      $(calendar.etableHeader).find('.hcal-cell-header-day').each(function(index, elm){
        var $elm = $(elm);
        var cdate = HotelCalendar.toMoment($elm.data('hcalDate'), HotelConstants.L10N_DATE_MOMENT_FORMAT);
        var data = _.filter(self._days_tooltips, function(item) {
          var ndate = HotelCalendar.toMoment(item[2], HotelConstants.ODOO_DATE_MOMENT_FORMAT);
          return ndate.isSame(cdate, 'd');
        });
        if (data.length > 0) {
          $elm.addClass('hcal-event-day');
          $elm.prepend("<i class='fa fa-bell' style='margin-right: 0.1em'></i>");
          $elm.on("mouseenter", function(data){
            var $this = $(this);
            if (data.length > 0) {
              var qdict = {
                'date': $this.data('hcalDate'),
                'events': _.map(data, function(item){
                  return {
                    'name': item[1],
                    'date': item[2],
                    'location': item[3]
                  };
                })
              };
              $this.attr('title', '');
              $this.tooltip({
                  animation: true,
                  html: true,
                  placement: 'bottom',
                  title: QWeb.render('HotelCalendar.TooltipEvent', qdict)
              }).tooltip('show');
            }
          }.bind(elm, data));
        }
      });
    },

    _sanitizeId: function(/*String*/str) {
      return str.replace(/[^a-zA-Z0-9\-_]/g, '_');
    },
  });

  return MultiCalendar;
});