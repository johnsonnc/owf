Ext.define('Ozone.components.window.DashboardSwitcher', {
    extend: 'Ozone.components.window.ModalWindow',
    alias: 'widget.dashboardswitcher',
    
    closeAction: 'hide',
    modal: true,
    preventHeader: true,
    modalAutoClose: true,
    shadow: false,
    layout: 'auto',
    ui: 'system-window',
    store: null,
    closable: false,
    title: 'Dashboards',
    iconCls: 'dashboard-switcher-header-icon',
    cls: 'system-window',
    resizable: false,
    draggable: false,

    viewId: 'dashboard-switcher-dashboard-view',

    dashboardContainer: null,

    //dashboard unit sizes
    dashboardItemHeight: 0,
    dashboardItemWidth: 0,

    //size of switcher in dashboard units
    minDashboardsWidth: 3,
    maxDashboardsWidth: 5,
    maxDashboardsHeight: 3,

    storeLengthChanged: true,

    selectedItemCls : 'dashboard-selected',

    _deletedStackOrDashboards: null,

    DROP_LEFT_CLS: 'x-view-drop-indicator-left',
    DROP_RIGHT_CLS: 'x-view-drop-indicator-right',


    _previouslyFocusedStackOrDashboard : null,
    
    initComponent: function() {

        var me = this,
            stackOrDashboards = [],
            stacks = {}, dashboards = {},
            dashboard, stack, model;

        for(var i = 0, len = me.dashboardStore.getCount(); i < len; i++) {

            model = me.dashboardStore.getAt(i);

            dashboard = Ext.clone(model.data);
            dashboard.model = model;
            dashboards[ dashboard.guid ] = dashboard;

            stack = dashboard.stack;
            console.log(i, ' => Dashboard name: ', dashboard.name, 'Stack: ', stack ? stack.name : 'none', ' Default: ', dashboard.isdefault);
            if( stack ) {
                if( stacks[ stack.id ] ) {
                    stacks[ stack.id ].dashboards.push( dashboard );
                }
                else {
                    stack.isStack = true;
                    stack.dashboards = [ dashboard ];

                    stacks[ stack.id ] = stack;
                    stackOrDashboards.push( stack );
                }
            }
            else {
                stackOrDashboards.push( dashboard );
            }

        }

        me.callParent(arguments);

        me.stackOrDashboards = stackOrDashboards;
        me.dashboards = dashboards;
        me.stacks = stacks;
        me._deletedStackOrDashboards = [];

        me.tpl = new Ext.XTemplate(
            '<tpl for=".">',
                '<div id="{[this.getName(values)+this.getId(values)]}" class="{[this.getClass(values)]}" tabindex="0" data-{[this.getName(values)]}-id="{[this.getId(values)]}" {[this.getToolTip(values)]}>',
                    '<div class="thumb-wrap">',
                        '<div class="thumb {layout}">',
                        '</div>',
                    '</div>',
                    '{[this.getActions(values)]}',
                    '<div class="{[this.getName(values)]}-name">',
                        '{[this.encodeAndEllipsize(values.name)]}',
                    '</div>',
                '</div>',
            '</tpl>'
        ,{
            compiled: true,
            getId: function (values) {
                return values.isStack ? values.id : values.guid;
            },
            getClass: function (values) {
                var name = this.getName(values);
                return values.guid === me.activeDashboard.id ? name + ' ' + me.selectedItemCls: name;
            },
            getName: function (values) {
                return values.isStack ? 'stack' : 'dashboard';
            },
            getPrettyTime: function (unformattedDate) {
                return Ext.util.Format.date(new Date(unformattedDate), Ozone.config.lastLoginDateFormat);
            },
            getToolTip: function (values) {
                var str = 'data-qtip="' +
                        '<h3 class=\'name\'>' + values.name + '</h3>' +
                        '<p class=\'tip-description\'>' + (values.description || 'No description found!') +'</p>';
                
                return values.isStack ? str + '"':
                        str +
                        '<br><p class=\'group\'>Group: ' + ((values.groups && values.groups.length > 0) ? values.groups[0].name : 'None') + '<p/>' +
                        '<p class=\'created-by\'>Created by: ' + values.createdBy.userRealName + '<p/>' +
                        '<p class=\'last-updated\'>Last Modified: ' + this.getPrettyTime(values.editedDate) + '<p/>"';
            },
            getActions: function (values) {
                return values.isStack ? 
                        '<ul class="stack-actions hide">'+
                            '<li class="restore icon-refresh" tabindex="0" data-qtip="Restore"></li>'+
                            '<li class="delete icon-remove" tabindex="0" data-qtip="Delete"></li>'+
                        '</ul>' :
                        '<ul class="dashboard-actions hide">'+
                            '<li class="share icon-share" tabindex="0" data-qtip="Share"></li>'+
                            '<li class="restore icon-refresh" tabindex="0" data-qtip="Restore"></li>'+
                            '<li class="edit icon-edit" tabindex="0" data-qtip="Edit"></li>'+
                            '<li class="delete icon-remove" tabindex="0" data-qtip="Delete"></li>'+
                        '</ul>'
            },
            encodeAndEllipsize: function(str) {
                //html encode the result since ellipses are special characters
                return Ext.util.Format.htmlEncode(
                    Ext.Array.map (
                        //get an array containing the first word of rowData.name as one elem, and the rest of name as another
                        Ext.Array.erase (/^([\S]+)\s*(.*)?/.exec(Ext.String.trim(str)), 0, 1),
                        function(it) {
                            //for each elem in the array, truncate it with an ellipsis if it is longer than 11 characters
                            return Ext.util.Format.ellipsis(it, 14);
                        }
                    //join the array back together with spaces
                    ).join(' ')
                );
            }
        });

        me.stackDashboardsTpl = '<div class="stack-dashboards"><div class="stack-dashboards-anchor-tip x-tip-anchor x-tip-anchor-top"></div><div class="dashboards"></div></div>';
        
        me.on('afterrender', function (cmp) {
            me.tpl.overwrite( cmp.body, stackOrDashboards );
            Ext.DomHelper.append( cmp.el, 
            '<ul class="actions">'+
                '<li class="manage" tabindex="0" >Manage</li>'+
                '<li class="create" tabindex="0" >+</li>'+
            '</ul>');

            me.bindEvents(cmp);
        });

        me.on('beforeclose', me.onClose, me);
        me.on('show', me.updateWindowSize, me);
        me.on('show', me.initCircularFocus, me, {single: true});
        me.on('show', me.focusActiveDashboard, me);
    },

    bindEvents: function () {
        var me = this,
            $ = jQuery,
            $dom = $(me.el.dom);

        $dom
            .on('click', '.dashboard', $.proxy(me.onDashboardClick, me))
            .on('click', '.stack', $.proxy(me.onStackClick, me))
            .on('click', '.manage', $.proxy(me.toggleManage, me))
            .on('click', '.create', $.proxy(me.createDashboard, me))
            .on('mouseover', '.stack, .dashboard', $.proxy(me.onMouseOver, me))
            .on('focus', '.stack, .dashboard', $.proxy(me.onMouseOver, me))
            .on('click', '.dashboard .restore', $.proxy(me.restoreDashboard, me))
            .on('click', '.dashboard .share', $.proxy(me.shareDashboard, me))
            .on('click', '.dashboard .edit', $.proxy(me.editDashboard, me))
            .on('click', '.dashboard .delete', $.proxy(me.deleteDashboard, me))
            .on('click', '.stack .restore', $.proxy(me.restoreStack, me))
            .on('click', '.stack .delete', $.proxy(me.deleteStack, me));

        me.initKeyboardNav();


        // drag and drop
        var $draggedItem,
            $draggedItemParent,
            $dragProxy;

        // disable selection while dragging
        $dom
            .attr('unselectable', 'on')
            .css('user-select', 'none')
            .on('selectstart', false);

        // reorder dashboards
        $dom.on('mousedown', '.dashboard, .stack', function (evt) {
            $draggedItem = $(this);
            $draggedItemParent = $draggedItem.parent();

            $dragProxy = $draggedItem.clone().addClass('x-dd-drag-proxy dashboard-drag-proxy');
            $('ul, .dashboard-name, .stack-name', $dragProxy).remove();
            $(document.body).append($dragProxy);

            // prevent tooltips from showing while drag n drop
            $dom.on('mouseover.reorder', '.dashboard, .stack', function (evt) { 
                evt.preventDefault();
                evt.stopPropagation();
            });

            $(document).on('mousemove.reorder', function (evt) { 
                var pageX = evt.pageX,      // The mouse position relative to the left edge of the document.
                    pageY = evt.pageY;      // The mouse position relative to the top edge of the document.

                $dragProxy.css({
                    left: pageX + 15,
                    top: pageY + 15
                });
            });

            $dom.on('mousemove.reorder', '.dashboard, .stack', function (evt) { 
                var $el = $(this);

                // only allow reordering if parents match and 
                // prevent reordering stack dashboards outside of stack and vice versa.
                if($draggedItemParent[0] !== $el.parent()[0])
                    return;

                var pageX = evt.pageX,      // The mouse position relative to the left edge of the document.
                    pageY = evt.pageY,      // The mouse position relative to the top edge of the document.
                    offset = $el.offset(),  // The offset relative to the top left edge of the document.
                    width = $el.outerWidth();

                $el.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
                
                if( pageX <= offset.left + (width/2) ) {
                    $el.addClass(me.DROP_LEFT_CLS);
                }
                else {
                    $el.addClass(me.DROP_RIGHT_CLS);
                }
            });

            $dom.on('mouseleave.reorder', '.dashboard, .stack', function (evt) {
                $(this).removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            });

            // drop performed on a dashboard
            $dom.on('mouseup.reorder', '.dashboard', function (evt) {
                me._dropOnDashboard($draggedItem, $(this));
            });
            
            // drop performed on a dashboard
            $dom.on('mouseup.reorder', '.stack', function (evt) {
                me._dropOnStack($draggedItem, $(this));
            });

            // cleanup on mouseup
            $(document).on('mouseup.reorder', function (evt) {
                $draggedItem =  null;
                $draggedItemParent = null;
                $dragProxy.remove();

                $(document).off('.reorder');
                $dom.off('.reorder');
            });
        });
    },

    initKeyboardNav: function () {
        var me = this;

        function moveLeft () {
            //move item left
            var $this = $(this),
                $prev = $this.prev();

            if($prev.length === 0)
                return;

            $prev.addClass( me.DROP_LEFT_CLS );
            $prev.hasClass('stack') ? me._dropOnStack($this, $prev) : me._dropOnDashboard($this, $prev);
        }

        function moveRight () {
            //move item right
            var $this = $(this),
                $next = $this.next();
            
            if($next.length === 0)
                return;

            $next.addClass( me.DROP_RIGHT_CLS );
            $next.hasClass('stack') ? me._dropOnStack($this, $next) : me._dropOnDashboard($this, $next);
        }

        $(me.el.dom)
            .on('keyup', '.stack', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.onStackClick(evt);
                }
                //left bracket
                else if (evt.which == 219) {
                    moveLeft.call(this);
                }
                //right bracket
                else if (evt.which == 221) {
                    moveRight.call(this);
                }
            })
            .on('keyup', '.dashboard', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.onDashboardClick(evt);
                }
                //left bracket
                else if (evt.which == 219) {
                    moveLeft.call(this);
                }
                //right bracket
                else if (evt.which == 221) {
                    moveRight.call(this);
                }
            })
            .on('focus', '.dashboard, .stack', function (evt) {
                $(evt.currentTarget).addClass(me.selectedItemCls);
            })
            .on('blur', '.dashboard, .stack', function (evt) {
                me._previouslyFocusedStackOrDashboard = $(evt.currentTarget).removeClass(me.selectedItemCls);
            })
            .on('focus', '.dashboard-actions li, .stack-actions li', function (evt) {
                $(evt.currentTarget).addClass('hover');
            })
            .on('blur', '.dashboard-actions li, .stack-actions li', function (evt) {
                $(evt.currentTarget).removeClass('hover');
            })
            .on('keyup', '.dashboard-actions .restore', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.restoreDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .share', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.shareDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .edit', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.editDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .delete', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.deleteDashboard(evt);
                }
            })
            .on('keyup', '.stack-actions .restore', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.restoreStack(evt);
                }
            })
            .on('keyup', '.stack-actions .delete', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.deleteStack(evt);
                }
            })
            .on('focus', '.manage', function (evt) {
                $(evt.currentTarget).addClass('selected');
            })
            .on('blur', '.manage', function (evt) {
                if(!me._managing) {
                    $(evt.currentTarget).removeClass('selected');
                }
            })
            .on('focus', '.create', function (evt) {
                $(evt.currentTarget).addClass('selected');
            })
            .on('blur', '.create', function (evt) {
                $(evt.currentTarget).removeClass('selected');
            })
            .on('keyup', '.manage', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.toggleManage(evt);
                    $(evt.currentTarget).addClass('selected');
                }
            })
            .on('keyup', '.create', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.createDashboard(evt);
                }
            });
    },


    _dropOnDashboard: function ($draggedItem, $dashboard) {
        var me = this,
            dashboard = me.getDashboard( $dashboard ),
            draggedItem;
        
        // dropped on the same element
        if($dashboard[0] === $draggedItem[0]) {
            $dashboard.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            return;
        }

        var droppedLeft = $dashboard.hasClass(me.DROP_LEFT_CLS);
        var store = me.dashboardStore;

        if ( droppedLeft ) {
            $dashboard.removeClass(me.DROP_LEFT_CLS);
            $draggedItem.insertBefore( $dashboard );
        }
        else {
            $dashboard.removeClass(me.DROP_RIGHT_CLS);
            $draggedItem.insertAfter( $dashboard );
        }

        // dropping dashboard on a dashboard
        if( $draggedItem.hasClass('dashboard') ) {
            draggedItem = me.getDashboard( $draggedItem );

            store.remove(draggedItem.model, true);

            var index = store.indexOf(dashboard.model);
            
            if ( !droppedLeft ) {
                index++;
            }

            store.insert(index, draggedItem.model);

        }
        else {
            // dropping stack on a dashboard

            draggedItem = me.getStack( $draggedItem );

            var stackDashboards = draggedItem.dashboards,
                stackDashboard;

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.remove(stackDashboard.model, true);
            }

            index = store.indexOf(dashboard.model);

            if ( !droppedLeft ) {
                index++;
            }
            
            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.insert(index++, stackDashboard.model);
            }

        }

        $draggedItem.focus();
        me.initCircularFocus();
        me.reordered = true;
    },

    _dropOnStack: function ($draggedItem, $stack) {
        var me = this,
            stack = me.getStack( $stack ),
            draggedItem;
        
        // dropped on the same element
        if($stack[0] === $draggedItem[0]) {
            $stack.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            return;
        }

        store = me.dashboardStore;

        var droppedLeft = $stack.hasClass(me.DROP_LEFT_CLS);
        var store = me.dashboardStore;

        // dropping dashboard on a stack
        if( $draggedItem.hasClass('dashboard') ) {

            draggedItem = me.getDashboard( $draggedItem );
            
            store.remove(draggedItem.model, true);

            var index;
            if ( droppedLeft ) {
                index = store.indexOf(stack.dashboards[0].model);
            }
            else {

                var $next = $stack.next();

                if( $next.length === 1) {
                    if( $next.hasClass('dashboard') ) {
                        var nextDash = me.getDashboard( $next );
                        index = store.indexOf(nextDash.model);
                    }
                    else {
                        // next item is a stack
                        // get the index of the first dashboard in the stack
                        var nextStack = me.getStack( $next );
                        index = store.indexOf(nextStack.dashboards[0].model);
                    }
                }
                else {
                    var lastStackDash = stack.dashboards[ stack.dashboards.length - 1 ];
                    index = store.indexOf(lastStackDash.model);
                    index++;
                }
            }

            store.insert(index, draggedItem.model);
        }
        else {
            // dropping stack on a stack
            draggedItem = me.getStack( $draggedItem );

            var stackDashboards = draggedItem.dashboards,
                stackDashboard;

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.remove(stackDashboard.model, true);
            }

            if ( droppedLeft ) {
                index = store.indexOf(stack.dashboards[0].model);
            }
            else {
                var $next = $stack.next();

                if( $next.length === 1) {
                    if( $next.hasClass('dashboard') ) {
                        var nextDash = me.getDashboard( $next );
                        index = store.indexOf(nextDash.model);
                    }
                    else {
                        // next item is a stack
                        // get the index of the first dashboard in the stack
                        var nextStack = me.getStack( $next );
                        index = store.indexOf(nextStack.dashboards[0].model);
                    }
                }
                else {
                    var lastStackDash = stack.dashboards[ stack.dashboards.length - 1 ];
                    index = store.indexOf(lastStackDash.model);
                    index++;
                }
            }

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.insert(index++, stackDashboard.model);
            }
        }

        if ( droppedLeft ) {
            $stack.removeClass(me.DROP_LEFT_CLS);
            $draggedItem.insertBefore( $stack );
        }
        else {
            $stack.removeClass(me.DROP_RIGHT_CLS);
            $draggedItem.insertAfter( $stack );
        }

        $draggedItem.focus();
        me.initCircularFocus();
        me.reordered = true;
    },

    initCircularFocus: function () {
        var firstEl = this.body.first(),
            addBtnEl = this.el.last().last();

        this.tearDownCircularFocus();
        this.setupFocus(firstEl, addBtnEl);
    },

    focusActiveDashboard: function () {
        var me = this,
            activeDashboardId = this.activeDashboard.id,
            selectedEl = $('#dashboard'+activeDashboardId);

        // active dashboard must be in a stack
        // expand the stack, then focus the active dashboard
        if(selectedEl.length === 0) {
            var stackId = this.activeDashboard.configRecord.get('stack').id;
            this.toggleStack(this.stacks[stackId], $('#stack'+stackId)).then(function () {
                me.focusActiveDashboard();
            });
            return;
        }

        setTimeout(function () {
            selectedEl && selectedEl.focus();
        }, 500);
    },

    getDashboard: function ($el) {
        return this.dashboards[ $el.attr('data-dashboard-id') ];
    },

    getStack: function ($el) {
        return this.stacks[ $el.attr('data-stack-id') ];
    },

    getElByClassFromEvent: function (evt, cls) {
        var $dashboard = $(evt.currentTarget || evt.target);
        return $dashboard.hasClass('cls') ? $dashboard : $dashboard.parents('.' + cls);
    },

    onDashboardClick: function (evt) {
        if((evt.type !== 'click' && evt.which !== Ext.EventObject.ENTER) || this._managing === true)
            return;

        var $clickedDashboard = $(evt.currentTarget),
            dashboard = this.getDashboard( $clickedDashboard );
            
        var stackContext = dashboard.stack ? dashboard.stack.stackContext : null;

        this.activateDashboard(dashboard.guid, stackContext);
        
        $clickedDashboard.addClass( this.selectedItemCls );

        if( this._$lastClickedDashboard ) {
            this._$lastClickedDashboard.removeClass( this.selectedItemCls );
        }

        this._$lastClickedDashboard = $clickedDashboard;
    },

    onStackClick: function (evt) {
        // evt.which == 1 => left mousedown
        if(evt.type === 'click' || evt.which === Ext.EventObject.ENTER) {
            var me = this,
                $ = jQuery,
                $clickedStack = $(evt.currentTarget),
                stack = me.getStack( $clickedStack );

            if( stack ) {
                me.toggleStack(stack, $clickedStack);
            }
            evt.preventDefault();
        }
    },

    toggleStack: function (stack, $stack) {
        var me = this,
            dfd = $.Deferred();

        if( me._lastExpandedStack ) {
            if( me._lastExpandedStack === stack ) {
                me.hideStackDashboards().then(function() {
                    me.$stackDashboards.remove();
                    me._lastExpandedStack = null;
                });
            }
            else {
                me.hideStackDashboards().then(function () {
                    me.$stackDashboards.remove();
                    me.showStackDashboards(stack, $stack, dfd);
                });
            }
        }
        else  {
            me.showStackDashboards(stack, $stack, dfd);
        }

        return dfd.promise();
    },

    showStackDashboards: function (stack, $clickedStack, dfd) {
        var me = this,
            clickedStackElWidth = $clickedStack.outerWidth( true ),
            clickedStackElHeight = $clickedStack.outerHeight( true ),
            parent = $clickedStack.parent(),
            parentWidth = parent.outerWidth( true ),
            lastElInRow;


        // get last element in the clikced stack's row
        var numItemsInRow = Math.round( parentWidth / clickedStackElWidth ),
            totalItems = this.stackOrDashboards.length,
            clickedStackIndex = $clickedStack.index() + 1;

        if( clickedStackIndex === totalItems || (clickedStackIndex % numItemsInRow) === 0 ) {
            lastElInRow = $clickedStack;
        }
        else {
            var i = clickedStackIndex;
            while( (i % numItemsInRow) !== 0 ) {
                i++;
                if( i >= totalItems ) {
                    break;
                }
            }
            lastElInRow = parent.children().eq(i-1);
        }

        // compile template and add to dom
        this.$stackDashboards = $( this.stackDashboardsTpl );
        this.$stackDashboards.children('.dashboards').html( this.tpl.applyTemplate( stack.dashboards ) )
        this.$stackDashboards.insertAfter( lastElInRow );

        this.stackDashboardsAnchorTip = $( '.stack-dashboards-anchor-tip' , this.$stackDashboards );

        // cache size of tip
        if( !this.stackDashboardsAnchorTipHeight ) {
            this.stackDashboardsAnchorTipHeight = this.stackDashboardsAnchorTip.outerHeight();
        }
        if( !this.stackDashboardsAnchorTipWidth ) {
            this.stackDashboardsAnchorTipWidth = this.stackDashboardsAnchorTip.outerWidth();
        }

        this.$stackDashboards.hide();

        // calculate top and left value for anchor tip
        var parentPosition = $clickedStack.position(),
            top = parentPosition.top + clickedStackElHeight - (this.stackDashboardsAnchorTipHeight),
            left = parentPosition.left + (clickedStackElWidth / 2) - (this.stackDashboardsAnchorTipWidth / 2);
        
        this.stackDashboardsAnchorTip.css({
            //top: top + 'px',
            left: left + 'px'
        });
        
        if(Ext.isIE7 || Ext.isIE8) {
            this.$stackDashboards.show();
            dfd.resolve();
        }
        else {
            this.$stackDashboards.slideDown('fast').promise().then(function () {
                dfd.resolve();
            });
        }
        
        this._lastExpandedStack = stack;
    },

    hideStackDashboards: function () {
        if(Ext.isIE7 || Ext.isIE8) {
            var dfd = $.Deferred();
            this.$stackDashboards && this.$stackDashboards.hide();
            dfd.resolve();
            return dfd.promise();
        }
        else {
            return this.$stackDashboards.slideUp('fast').promise();
        }
    },

    onMouseOver: function (evt) {
        var el,
            $ = jQuery;

        if( !this._managing )
            return;

        el = $(evt.currentTarget);

        if(this._lastManageEl) {
            if(el[0] === this._lastManageEl[0]) {
                return;
            }
            else {
                //$('ul', this._lastManageEl).slideUp();
                $('ul', this._lastManageEl).addClass('hide');
                //this.hideStackDashboards();
            }
        }

        this._lastManageEl = el;

        //$('ul', el).slideDown();
        $('ul', this._lastManageEl).removeClass('hide');

        $('.dashboard, .stack', this.el.dom).css('height', el.height() + 'px');
    },

    updateDashboardEl: function ($dashboard, dashboard) {
        var $el = $(this.tpl.apply([dashboard])).insertBefore($dashboard);
        $dashboard.remove();
        $el.focus();
    },

    toggleManage: function (evt) {
        var $manageBtn;

        if(evt) {
            $manageBtn = $(evt.currentTarget);
            this.$manageBtn = $manageBtn;
        }

        if( this._managing ) {
            this.resetManage();
            this._managing = false;
        }
        else {
            // add selected class to manage button
            $manageBtn && $manageBtn.addClass('selected');
            this._managing = true;
            if(this._previouslyFocusedStackOrDashboard) {
                this._previouslyFocusedStackOrDashboard.trigger('mouseover');
            }
        }
    },

    resetManage: function () {
        if(!this._managing)
            return;

        this.$manageBtn.removeClass('selected');
        // reset the height to normal
        $('.dashboard, .stack', this.el.dom).css('height', '');
        
        // hide action buttons of previously clicked stack
        if( this._lastManageEl ) {
             //$('ul', this._lastManageEl).slideUp();
             $('ul', this._lastManageEl).addClass('hide');
             this._lastManageEl = null;
        }
        this._managing = false;
    },

    restoreDashboard: function (evt) {
        evt.stopPropagation();
        var me = this,
            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboard = this.getDashboard($dashboard),
            dashboardGuid = dashboard.guid;

        this.warn('This action will return the dashboard <span class="heading-bold">' + dashboard.name + '</span> to its current default state. If an administrator changed the dashboard after it was assigned to you, the default state may differ from the one that originally appeared in your Switcher.', function () {
            Ext.Ajax.request({
                url: Ozone.util.contextPath() + '/dashboard/restore',
                params: {
                    guid: dashboardGuid,
                    isdefault: dashboardGuid == me.activeDashboard.guid
                },
                success: function(response, opts) {
                    var json = Ext.decode(response.responseText);
                    if (json != null && json.data != null && json.data.length > 0) {
                        me.notify('Restore Dashboard', '<span class="heading-bold">' + dashboard.name + '</span> is restored successfully to its original state!');

                        var name = json.data[0].name,
                            description = json.data[0].description;

                        dashboard.model.set({
                            'name': name,
                            'description': description
                        });
                        dashboard.name = name;
                        dashboard.description = name;

                        me.updateDashboardEl($dashboard, dashboard);

                        me.reloadDashboards = true;
                    }
                },
                failure: function(response, opts) {
                    Ozone.Msg.alert('Dashboard Manager', "Error restoring dashboard.", function() {
                        Ext.defer(function() {
                            $dashboard[0].focus();
                        }, 200, me);
                    }, me, null, me.dashboardContainer.modalWindowManager);
                    return;
                }
            });
        }, function () {
            evt.currentTarget.focus();
        });
    },

    shareDashboard: function (evt) {
        evt.stopPropagation();

        var $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboard = this.getDashboard($dashboard),
            dashboardModel = dashboard.model;

        // delete model before cloning to remove circular refs
        delete dashboard.model;
        var cloneDashboard = Ozone.util.cloneDashboard(dashboard, false, true);

        // reset dashboard model
        dashboard.model = dashboardModel;

        // Stop unload event from firing long enough to submit form.
        // Have to do this because the form submit triggers the window's unload event
        // which causes competing requests.  (SEE OWF-4280)
        Ext.EventManager.un(window, 'beforeunload', this.dashboardContainer.onBeforeUnload);

        var elForm = document.createElement('form');
        var elInput = document.createElement('input');
        elInput.id = 'json';
        elInput.name = 'json';
        elInput.type = 'hidden';
        elInput.value = Ext.JSON.encode(cloneDashboard);
        elForm.appendChild(elInput);
        elForm.action = Ozone.util.contextPath() + '/servlet/ExportServlet';
        elForm.method = 'POST';
        elForm.enctype = elForm.encoding = 'multipart/form-data';
        document.body.appendChild(elForm);
        elForm.submit();
        document.body.removeChild(elForm);
        elForm = null;
        elInput = null;
        var dmScope = this;
        setTimeout(function() {
            Ext.EventManager.on(window, 'beforeunload', dmScope.dashboardContainer.onBeforeUnload, dmScope.dashboardContainer);
        }, 100);
    },

    createDashboard: function (evt) {
        var me = this,
            createDashWindow = Ext.widget('createdashboardwindow', {
            itemId: 'createDashWindow',
            dashboardContainer: me.dashboardContainer,
            ownerCt: me.dashboardContainer,
            listeners: {
                cancel: function () {
                    me.show();
                    setTimeout(function () {
                        evt.currentTarget.focus();
                    }, 10);
                }
            }
        });

        createDashWindow.show();
        me.close();
    },

    editDashboard: function (evt) {
        evt.stopPropagation();

        var me = this,
            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboard = this.getDashboard($dashboard);

        var editDashWindow = Ext.widget('createdashboardwindow', {
            itemId: 'editDashWindow',
            title: 'Edit Dashboard',
            height: 250,
            dashboardContainer: this.dashboardContainer,
            ownerCt: this.dashboardContainer,
            hideViewSelectRadio: true,
            existingDashboardRecord: dashboard.model,
            listeners: {
                cancel: function () {
                    me.show();
                    evt.currentTarget.focus();
                }
            }
       }).show();

       this.close();
    },

    deleteDashboard: function (evt) {
        evt.stopPropagation();

        var me = this,
            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboard = this.getDashboard($dashboard),
            msg;

        function focusEl () {
            evt.currentTarget.focus();
        }
        
        if(dashboard.stack) {
            this.warn('Users cannot remove individual dashboards from a stack. Please contact your administrator.', focusEl, focusEl);
            return;
        }

        if(dashboard.groups && dashboard.groups.length > 0) {
            this.warn('Users cannot remove dashboards assigned to a group. Please contact your administrator.', focusEl, focusEl);
            return;
        }

        msg = 'This action will permanently delete <span class="heading-bold">' + Ext.htmlEncode(dashboard.name) + '</span>.';

        this.warn(msg, function () {
            me.dashboardStore.remove(dashboard.model);
            me.dashboardStore.save();
            me.notify('Delete Dashboard', '<span class="heading-bold">' + dashboard.name + '</span> deleted!');

            me._deletedStackOrDashboards.push(dashboard);

            var $prev = $dashboard.prev();
            $dashboard.remove();
            $prev.focus();

        }, focusEl);
    },

    restoreStack: function (evt) {
        evt.stopPropagation();
        var $stack = this.getElByClassFromEvent(evt, 'stack'),
            stack = this.getStack($stack);

        console.log('restore stack', stack.id);
    },

    deleteStack: function (evt) {
        evt.stopPropagation();

        var me = this,
            $stack = this.getElByClassFromEvent(evt, 'stack'),
            stack = this.getStack($stack),
            msg = 'This action will permanently delete stack <span class="heading-bold">' 
                    + Ext.htmlEncode(stack.name) + '</span> and its dashboards.';

        function focusEl () {
            evt.currentTarget.focus();
        }

        var stackGroups = stack.groups,
            userGroups = Ozone.config.user.groups,
            groupAssignment = false;
        
        if(stackGroups && userGroups && stackGroups.length > 0 && userGroups.length > 0) {
            for (var i = 0, len1 = stackGroups.length; i < len1; i++) {
                var stackGroup = stackGroups[i];
                
                for (var j = 0, len2 = userGroups.length; j < len2; j++) {
                    var userGroup = userGroups[j];
                    if(stackGroup.id === userGroup.id) {
                        groupAssignment = true;
                        break;
                    }
                }

                if(groupAssignment === true)
                    break;
            }
        }

        if(groupAssignment) {
            this.warn('Users in a group cannot remove stacks assigned to the group. Please contact your administrator.', focusEl, focusEl);
            return;
        }

        this.warn(msg, function () {
            me.dashboardContainer.stackStore.remove( me.dashboardContainer.stackStore.getById(stack.id) );
            me.dashboardContainer.stackStore.save();

            if( me._lastExpandedStack === stack) {
                me.hideStackDashboards();
            }

            var $prev = $stack.prev();
            $stack.remove();
            $prev.focus();
            
            me._deletedStackOrDashboards.push(stack);

        }, focusEl);
    },

    warn: function (msg, okFn, cancelFn) {
        Ext.widget('alertwindow',{
            title: "Warning",
            html:  msg,
            minHeight: 115,
            width: 250,
            dashboardContainer: this.dashboardContainer,
            okFn: okFn,
            cancelFn: cancelFn
        }).show();
    },

    notify: function  (title, msg, type /* default is success*/) {
        var stack_bottomright = {"dir1": "up", "dir2": "left", "firstpos1": 25, "firstpos2": 25};
        $.pnotify({
            title: title,
            text: msg,
            type: type || 'success',
            addclass: "stack-bottomright",
            stack: stack_bottomright,
            history: false,
            sticker: false,
            icon: false,
            delay: 3000
        });
    },

    activateDashboard: function (guid, stackContext) {
        this.close();
        this.dashboardContainer.activateDashboard(guid, false, stackContext);
    },

    updateWindowSize: function() {
        var newWidth,
            newHeight,
            item = this.body.first().dom;
        
        if(!item)
            return;

        var itemEl = Ext.get(item),
            windowEl = this.getEl(),
            widthMargin = itemEl.getMargin('lr'),
            heightMargin = itemEl.getMargin('tb'),
            totalDashboards = this.body.query('.dashboard, .stack').length,
            dashboardInRow = 0;

        this.dashboardItemWidth = itemEl.getWidth();
        this.dashboardItemHeight = itemEl.getHeight();

        if(totalDashboards < this.minDashboardsWidth) {
            dashboardInRow = this.minDashboardsWidth;
        }
        else if (totalDashboards > this.maxDashboardsWidth) {
            dashboardInRow = this.maxDashboardsWidth;
        }
        else {
            dashboardInRow = totalDashboards;
        }

        newWidth = (this.dashboardItemWidth + widthMargin + 1) * dashboardInRow;

        if(totalDashboards > this.maxDashboardsWidth * this.maxDashboardsHeight) {
            // add 30 to accomodate for scrollbar
            newWidth += 30;
        }
        if(totalDashboards > this.maxDashboardsWidth * this.maxDashboardsHeight) {
            newHeight = (this.dashboardItemHeight + heightMargin) * this.maxDashboardsHeight;
        }

        this.body.setSize(newWidth + 30, newHeight);
        
        this.body.setStyle({
            'max-height': ((this.dashboardItemHeight + heightMargin + 1) * this.maxDashboardsHeight) + 'px'
        });
    },

    saveDashboardOrder: function () {
        var dfd = $.Deferred();
        var gridData = this.dashboardStore.data.items;
        var viewsToUpdate = [];
        var viewGuidsToDelete = [];
    
        for (var i = 0; i < gridData.length; i++) {
            if (!gridData[i].data.removed) {
                viewsToUpdate.push({
                    guid: gridData[i].data.guid,
                    isdefault: gridData[i].data.isdefault,
                    name: gridData[i].data.name.replace(new RegExp(Ozone.lang.regexLeadingTailingSpaceChars), '')
                });
            } else {
                viewGuidsToDelete.push(gridData[i].data.guid);
            }
        }

        Ozone.pref.PrefServer.updateAndDeleteDashboards({
            viewsToUpdate: viewsToUpdate,
            viewGuidsToDelete: viewGuidsToDelete,
            updateOrder: true,
            onSuccess: function() {
                dfd.resolve();
            },
            onFailure: function() {
                dfd.reject();
            }
        });

        return dfd.promise();
    },

    onClose: function() {
        var me = this;

        me.resetManage();
        //me.tearDownCircularFocus();

        // refresh if user deleted all dashboards
        if(me.dashboardContainer.dashboardStore.getCount() === 0) {
            window.location.reload();
            return;
        }

        if (me.reordered) {
            if(me.reloadDashboards) {
                me.saveDashboardOrder().always(function () {
                    me.dashboardContainer.reloadDashboards();
                });
            }
            else {
                me.saveDashboardOrder().fail(function () {
                    me.dashboardContainer.reloadDashboards();
                });
            }
        }
        else if(me.reloadDashboards === true) {
            me.dashboardContainer.reloadDashboards();
        }
    },

    destroy: function () {
        this.tearDownCircularFocus();

        // remove jQuery listeners
        $(this.el.dom).off();

        // destroy view so that it will be recreated when opened next setTimeout
        return this.callParent();
    }
});
