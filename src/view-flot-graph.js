this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

// Views module following classic module pattern
(function($, my) {

// Graph view for a Dataset using Flot graphing library.
//
// Initialization arguments:
//
// * model: recline.Model.Dataset
// * config: (optional) graph configuration hash of form:
//
//        { 
//          group: {column name for x-axis},
//          series: [{column name for series A}, {column name series B}, ... ],
//          graphType: 'line'
//        }
//
// NB: should *not* provide an el argument to the view but must let the view
// generate the element itself (you can then append view.el to the DOM.
my.FlotGraph = Backbone.View.extend({

  tagName:  "div",
  className: "data-graph-container",

  template: ' \
  <div class="editor"> \
    <div class="editor-info editor-hide-info"> \
      <h3 class="action-toggle-help">Help &raquo;</h3> \
      <p>To create a chart select a column (group) to use as the x-axis \
         then another column (Series A) to plot against it.</p> \
      <p>You can add add \
         additional series by clicking the "Add series" button</p> \
    </div> \
    <form class="form-stacked"> \
      <div class="clearfix"> \
        <label>Graph Type</label> \
        <div class="input editor-type"> \
          <select> \
          <option value="line">Line</option> \
          </select> \
        </div> \
        <label>Group Column (x-axis)</label> \
        <div class="input editor-group"> \
          <select> \
          {{#headers}} \
          <option value="{{.}}">{{.}}</option> \
          {{/headers}} \
          </select> \
        </div> \
        <div class="editor-series-group"> \
          <div class="editor-series"> \
            <label>Series <span>A (y-axis)</span></label> \
            <div class="input"> \
              <select> \
              {{#headers}} \
              <option value="{{.}}">{{.}}</option> \
              {{/headers}} \
              </select> \
            </div> \
          </div> \
        </div> \
      </div> \
      <div class="editor-buttons"> \
        <button class="btn editor-add">Add Series</button> \
      </div> \
      <div class="editor-buttons editor-submit" comment="hidden temporarily" style="display: none;"> \
        <button class="editor-save">Save</button> \
        <input type="hidden" class="editor-id" value="chart-1" /> \
      </div> \
    </form> \
  </div> \
  <div class="panel graph"></div> \
</div> \
',

  events: {
    'change form select': 'onEditorSubmit'
    , 'click .editor-add': 'addSeries'
    , 'click .action-remove-series': 'removeSeries'
    , 'click .action-toggle-help': 'toggleHelp'
  },

  initialize: function(options, config) {
    var self = this;
    this.el = $(this.el);
    _.bindAll(this, 'render', 'redraw');
    // we need the model.headers to render properly
    this.model.bind('change', this.render);
    this.model.currentDocuments.bind('add', this.redraw);
    this.model.currentDocuments.bind('reset', this.redraw);
    var configFromHash = my.parseHashQueryString().graph;
    if (configFromHash) {
      configFromHash = JSON.parse(configFromHash);
    }
    this.chartConfig = _.extend({
        group: null,
        series: [],
        graphType: 'line'
      },
      configFromHash,
      config
      );
    this.render();
  },

  toTemplateJSON: function() {
    return this.model.toJSON();
  },

  render: function() {
    htmls = $.mustache(this.template, this.toTemplateJSON());
    $(this.el).html(htmls);
    // now set a load of stuff up
    this.$graph = this.el.find('.panel.graph');
    // for use later when adding additional series
    // could be simpler just to have a common template!
    this.$seriesClone = this.el.find('.editor-series').clone();
    this._updateSeries();
    return this;
  },

  onEditorSubmit: function(e) {
    var select = this.el.find('.editor-group select');
    this._getEditorData();
    // update navigation
    // TODO: make this less invasive (e.g. preserve other keys in query string)
    var qs = my.parseHashQueryString();
    qs['graph'] = this.chartConfig;
    my.setHashQueryString(qs);
    this.redraw();
  },

  redraw: function() {
    // There appear to be issues generating a Flot graph if either:

    // * The relevant div that graph attaches to his hidden at the moment of creating the plot -- Flot will complain with
    //
    //   Uncaught Invalid dimensions for plot, width = 0, height = 0
    // * There is no data for the plot -- either same error or may have issues later with errors like 'non-existent node-value' 
    var areWeVisible = !jQuery.expr.filters.hidden(this.el[0]);
    if (!this.plot && (!areWeVisible || this.model.currentDocuments.length == 0)) {
      return
    }
    // create this.plot and cache it
    if (!this.plot) {
      // only lines for the present
      options = {
        id: 'line',
        name: 'Line Chart'
      };
      this.plot = $.plot(this.$graph, this.createSeries(), options);
    } 
    this.plot.setData(this.createSeries());
    this.plot.resize();
    this.plot.setupGrid();
    this.plot.draw();
  },

  _getEditorData: function() {
    $editor = this
    var series = this.$series.map(function () {
      return $(this).val();
    });
    this.chartConfig.series = $.makeArray(series)
    this.chartConfig.group = this.el.find('.editor-group select').val();
  },

  createSeries: function () {
    var self = this;
    var series = [];
    if (this.chartConfig) {
      $.each(this.chartConfig.series, function (seriesIndex, field) {
        var points = [];
        $.each(self.model.currentDocuments.models, function (index, doc) {
          var x = doc.get(self.chartConfig.group);
          var y = doc.get(field);
          if (typeof x === 'string') {
            x = index;
          }
          points.push([x, y]);
        });
        series.push({data: points, label: field});
      });
    }
    return series;
  },

  // Public: Adds a new empty series select box to the editor.
  //
  // All but the first select box will have a remove button that allows them
  // to be removed.
  //
  // Returns itself.
  addSeries: function (e) {
    e.preventDefault();
    var element = this.$seriesClone.clone(),
        label   = element.find('label'),
        index   = this.$series.length;

    this.el.find('.editor-series-group').append(element);
    this._updateSeries();
    label.append(' [<a href="#remove" class="action-remove-series">Remove</a>]');
    label.find('span').text(String.fromCharCode(this.$series.length + 64));
    return this;
  },

  // Public: Removes a series list item from the editor.
  //
  // Also updates the labels of the remaining series elements.
  removeSeries: function (e) {
    e.preventDefault();
    var $el = $(e.target);
    $el.parent().parent().remove();
    this._updateSeries();
    this.$series.each(function (index) {
      if (index > 0) {
        var labelSpan = $(this).prev().find('span');
        labelSpan.text(String.fromCharCode(index + 65));
      }
    });
    this.onEditorSubmit();
  },

  toggleHelp: function() {
    this.el.find('.editor-info').toggleClass('editor-hide-info');
  },

  // Private: Resets the series property to reference the select elements.
  //
  // Returns itself.
  _updateSeries: function () {
    this.$series  = this.el.find('.editor-series select');
  }
});

})(jQuery, recline.View);
