// Get handle to lodash functional programming interface.
var _fp = _fp || _.noConflict();
var SCHEMA = SCHEMA || {};

SCHEMA.Definitions = _.merge(_.cloneDeep(SCHEMA.Definitions) || {}, {
   'definitions':
    {'PandasType':
     {"type": "object",
      "properties": {"index": {"type": "array"},
                     "index_dtype": {"type": "string"},
                     "index_name": {"type": "string"},
                     "values": {"type": "array"},
                     "type": {"type": "string",
                              "enum": ["Series", "DataFrame"]}},
      "required": ['index', 'values', 'type']}}});

SCHEMA.Series = _.merge(_.cloneDeep(SCHEMA.Definitions),
    {'description': '',
     'allOf': [{'$ref': '#/definitions/PandasType'},
               {'properties':
                {"type": {"type": "string",
                          "pattern": "Series"}}}]});

SCHEMA.DataFrame = _.merge(_.cloneDeep(SCHEMA.Definitions),
    {'description': '',
     'allOf': [{'$ref': '#/definitions/PandasType'},
               {'properties':
                {"columns": {"type": "array"},
                 "type": {"type": "string",
                          "pattern": "DataFrame"}},
                "required": ["columns"]}]});


function data_frame_to_js(df_i) {
    /*
     * Args
     * ----
     *
     *     df_i (object) : Javascript object with at least the keys `"index",
     *         "values", and "columns"`, where `"index"` and `"values"` are
     *         `Array` instances with the same length and each element of
     *         `"values"` is an `Array` with the same length as `"columns"`.
     *         Each value in `"columns"` corresponds to the key of the
     *         respective column in the data frame.
     *
     * Returns
     * -------
     *
     *     (object) : Nested object.  Top level is keyed by values in `"index"`
     *         property of input object.  Each top level object is keyed by
     *         `"columns"` property of input object and corresponds to the
     *         respective values in the input data frame (i.e., values from the
     *         `"values"` property of the input object).
     */
    return _.zipObject(df_i.index,
                       _fp.map(_fp.zipObject(df_i.columns))(df_i.values));
}


function describe(objs) {
  /*
   * For each key found in each object in the input objects array, compute the
   * following:
   *
   *  - Sum
   *  - Minimum
   *  - Maximum
   *  - Count
   *  - Mean (average)
   *
   *  Args
   *  ----
   *
   *      objs (Array) : Array of input objects.
   *
   *  Returns
   *  -------
   *
   *      (object) : Object containing a key for each unique key present in any
   *          of the input objects.  For each key, the corresponding value is
   *          an object containing the keys "min", "max", "sum", "count", and
  *          "mean", corresponding to the summary statistics described above
  *          for the respective values in the input objects.
   */
  var result_i = _.reduce(objs, function(acc, obj) {
    _.each(obj, function(value, key) {
      function defined(v) { return (typeof(v) != "undefined"); }

      if (!defined(acc[key])) { acc[key] = {}; };

      acc[key]["max"] = Math.max((defined(acc[key]["max"]) ?
                                  acc[key]["max"] : 0), value);
      acc[key]["min"] = Math.min((defined(acc[key]["min"]) ? acc[key]["min"] :
                                  Number.MAX_SAFE_INTEGER), value);
      acc[key]["sum"] = (defined(acc[key]["sum"]) ? acc[key]["sum"] + value : value);
      acc[key]["count"] = (defined(acc[key]["count"]) ? acc[key]["count"] + 1 : 1);
    });
    return acc;
  }, {});

  /* Compute the mean from the count and the sum. */
  for (var key in result_i) {
    result_i[key]["mean"] = ((result_i[key]["count"] > 0) ?
                             result_i[key]["sum"] / result_i[key]["count"] : 0);
  }
  return result_i;
}


/* Add "`describe`" as a prototype method to `Array` objects. */
Array.prototype.describe = function () { return describe(this); }

var maxStringLength = _fp.flow(_fp.map(_fp.flow(_.toString, _.size)), _.max);
/* maxStringLength(array)
 *
 * Args
 * ----
 *     array (Array) : Array of objects.
 *
 * Returns
 * -------
 *
 *     (number) : Max length of string representation of any object in `array`.
 */

class DataFrame {
  constructor(df_i) {
    _.merge(this, _.cloneDeep(df_i));
    this._df = data_frame_to_js(this);
    this.index_name = this.index_name || "";
    this.size = this.index.length;
    this.columnPositions = _.fromPairs(_.zip(this.columns,
                                             _.range(this.columns.length)));
  }

  to_records() {
    return data_frame_to_js(this);
  }

  get(column) {
    if (_.isArray(column)) {
      // Multiple columns were specified.
      var columns = column;
      // Get array of values for each column.
      var values_i = _.unzip(_fp.map(_fp.at(columns))(this._df));
      // Return a mapping from each column key to an ``Array`` of values for
      // the column.
      return _.zipObject(columns, values_i);
    } else {
      // A single column was specified.
      // Return an ``Array`` of values for the column.
      return _fp.map(_fp.get(column))(this._df);
    }
  }

  pick(columns) {
    columns = _.castArray(columns);
    var df_i = _.clone(this);
    df_i.columns = columns;
    df_i.values = _fp.map(_fp.at(columns))(_fp.at(df_i.index)(df_i._df));
    return new DataFrame(df_i);
  }

  ix(index_values) {
    index_values = _.castArray(index_values);
    var df_i = _.clone(this);
    df_i.index = index_values;
    df_i.values = _fp.map(_fp.at(df_i.columns))(_fp.at(df_i.index)(df_i._df));
    return new DataFrame(df_i);
  }

  iloc(positions) {
    positions = _.castArray(positions);
    var df_i = _.clone(this);
    df_i.index = _fp.map(function (i) { return _.nth(df_i.index, i); })(positions);
    if (!(_.every(_fp.map(_.negate(_.isUndefined))(df_i.index)))) {
        throw "Invalid positions"
    };
    df_i.values = _fp.map(function (i) { return _.nth(df_i.values, i); })(positions);
    return new DataFrame(df_i);
  }

  describe(columns) {
    columns = columns || this.columns;
    return describe(_fp.map(_fp.flow(_fp.zipObject(this.columns),
                                     _fp.pick(columns)))(this.values));
  }

  columnWidths() {
    /*
     * Returns
     * -------
     *
     *     (Object) : Mapping of each column name to the corresponding maximum
     *         string length of all values in the column (including the column
     *         name).
     */
    var columnWidths = _fp.map(maxStringLength)
        (_.unzip(_.concat([this.columns], this.values)));
    return _fp.zipObject(this.columns)(columnWidths);
  }

  columnPadding() {
    /*
     * Returns
     * -------
     *
     *     (Object) : Mapping of each column name to a unary *function* that
     *         accepts a string and returns a string padded to the maximum
     *         string length of all values in the column (including the column
     *         name).
     */
    return _fp.mapValues(_fp.padStart)(this.columnWidths());
  }

  indexWidth() {
    /*
     * Returns
     * -------
     *
     *     (number) : The maximum string length of all values in the index
     *         (including the index name).
     */
      return maxStringLength(_.concat([this.index_name], this.index));
  }

  indexPadding() {
    /*
     * Returns
     * -------
     *
     *     (function) : A unary *function* that accepts a string and returns a
     *         string padded to the maximum string length of all values in the
     *         index (including the index name).
     */
      return _fp.padStart(this.indexWidth());
  }

  formatRows() {
    /*
     * Returns
     * -------
     *
     *     (function) : A function that accepts a single argument, an `Array`
     *         of rows.  The length of each row must be one greater than the
     *         number of columns in the data frame, where the first value is
     *         interpreted as the row's index value.
     */
    var rowPadding = _.concat([this.indexPadding()], _.at(this.columnPadding(),
                                                          this.columns));
    var padRow = _fp.flow(_fp.zip(rowPadding),
                          _fp.map(_.spread(function (padding, value) {
                            return padding(value);
                          })));
    return _fp.flow(_fp.map(_fp.flow(padRow, _fp.join("  "))), _fp.join("\n"));
  }

  rows() {
    /*
     * Returns
     * -------
     *
     *     (Array) : Array of frame rows, where the first row corresponds to
     *         the column labels and the remaining rows correspond to the frame
     *         contents.  The first entry of each row corresponds to the
     *         respective row index value (except for the first row, where the
     *         first entry is the name of the index).
     */
    var indexColumn = _.concat([this.index_name], this.index);
    var tableColumns = _.concat([indexColumn], _.unzip(_.concat([this.columns],
                                                                this.values)));
    var tableRows = _.unzip(tableColumns);
    return tableRows;
  }

  head(count=5) {
    /*
     * Args
     * ----
     *
     *     count (number) : Number of rows to include.
     *
     * Returns
     * -------
     *
     *     (DataFrame) : Data frame containing only the first `count` rows.  If
     *         `count` is greater than or equal to the length of the data
     *         frame, the resulting frame will contain all rows.
     */
    count = _.clamp(count, 0, this.size);
    return this.iloc(_.range(count));
  }

  tail(count=5) {
    /*
     * Args
     * ----
     *
     *     count (number) : Number of rows to include.
     *
     * Returns
     * -------
     *
     *     (DataFrame) : Data frame containing only the last `count` rows.  If
     *         `count` is greater than or equal to the length of the data
     *         frame, the resulting frame will contain all rows.
     */
    count = _.clamp(count, 0, this.size);
    return this.iloc(_.range(this.size - count, this.size));
  }

  toString() {
    /*
     * Returns
     * -------
     *
     *     (String) : A string representation of the data frame in a form
     *         inspired by `pandas.DataFrame`.
     */
    return this.formatRows()(this.rows());
  }

  sortValues(columns=null) {
    /*
     * Args
     * ----
     *
     *     columns (list) : List of columns to sort by, in order.
     *
     * Returns
     * -------
     *
     *     (DataFrame) : Return new data frame with index/rows sorted according
     *         to the specified columns.
     */
    // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
    // TODO Add support for sorting in descending order. (see [`orderBy`][1])
    // TODO
    // TODO [1]: https://lodash.com/docs#orderBy
    // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO

    // Append index value to each row.
    var valueColumns = _.unzip(this.values);
    var columns_i = _.concat([this.index.slice()], valueColumns);
    var rows_i = _.unzip(columns_i);

    columns = columns || this.columns;
    // Modify column positions to account for index column.
    var columnPositions_i = _.mapValues(this.columnPositions, _fp.add(1));

    // Sort rows (including index values) according to specified columns.
    rows_i = _.sortBy(rows_i, _.at(columnPositions_i, columns));
    columns_i = _.unzip(rows_i);

    // Return new data frame with new row/index order.
    var df_i = _.clone(this);
    df_i.index = columns_i[0];
    df_i.values = _.unzip(columns_i.slice(1, columns_i.length));
    return new DataFrame(df_i);
  }

  groupRecordsBy(columns=null) {
    /*
     * Parameters
     * ----------
     * columns, optional : string or Array
     *     Column(s) to group rows by.
     *
     * Returns
     * -------
     * Object
     *     Mapping from each **group key** to an **``Array`` of records** only
     *     containing rows where ``columns`` match corresponding group value.
     *
     * See also
     * --------
     * `meth:groupBy`
     */
    columns = columns || this.columns;
    var groups_i = _fp.groupBy(_fp.at(_.at(this.columnPositions,
                                           columns)))(this.values);
    return _fp.mapValues(_fp.map(_fp.zipObject(this.columns)))(groups_i);
  }

  groupBy(columns=null) {
    /*
     * Parameters
     * ----------
     * columns, optional : string or Array
     *     Column(s) to group rows by.
     *
     * Returns
     * -------
     * Object
     *     Mapping from each **group key** to a **``DataFrame``** only
     *     containing rows where ``columns`` match corresponding group value.
     *
     * See also
     * --------
     * `meth:groupRecordsBy`
     */
    // Append index value to each row.
    var valueColumns = _.unzip(this.values);
    var columns_i = _.concat([this.index.slice()], valueColumns);
    var rows_i = _.unzip(columns_i);

    columns = columns || this.columns;
    // Modify column positions to account for index column.
    var columnPositions_i = _.mapValues(this.columnPositions, _fp.add(1));
    var selectedPositions_i = _fp.at(columns)(columnPositions_i);

    // Sort rows (including index values) according to specified columns.
    var groups_i = _.groupBy(rows_i, _fp.at(selectedPositions_i));

    return _.mapValues(groups_i, (v, k) => {
        // Return new data frame with new row/index order.
        var df_i = _.clone(this);
        columns_i = _.unzip(v);
        df_i.index = columns_i[0];
        df_i.values = _.unzip(columns_i.slice(1, columns_i.length));
        return new DataFrame(df_i);
    });
  }
}


var objs = [
  { a: 4, b: 0.5 , c: 0.35, d: 5 },
  { a: 400, b: 0 , c: 35, d: 15 },
  { a: 9, b: 14 , c: 25, d: 0 }
];

//var df_i = JSON.parse('{"index":[100,200],"values":[["electrode000","119","fill: rgb(0,0,255)",0,8.193534947020888,21.08263883822222,7.349646232577777,21.951805558666663,0.8438887144431106,-0.8691667204444435],["electrode000","119","fill: rgb(0,0,255)",1,6.505757518134666,21.08263883822222,7.349646232577777,21.951805558666663,-0.8438887144431115,-0.8691667204444435]],"index_dtype":"int64","columns":["id","data-channels","style","vertex_i","x","y","x_center","y_center","x_center_offset","y_center_offset"],"type":"DataFrame"}');
var df_i = JSON.parse("{\"index\":[0,1,2,3,4,5,6,7,8,9],\"values\":[[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",0,6.7064461022222215,15.635110828888887,6.42422402111111,15.914510546666666,0.2822220811111116,-0.2793997177777783],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",1,6.40729111111111,15.635110828888887,6.42422402111111,15.914510546666666,-0.016932909999999524,-0.2793997177777783],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",2,6.40729111111111,15.522221375555555,6.42422402111111,15.914510546666666,-0.016932909999999524,-0.39228917111111095],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",3,6.144824162222221,15.522221375555555,6.42422402111111,15.914510546666666,-0.27939985888888863,-0.39228917111111095],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",4,6.144824162222221,15.632288042222221,6.42422402111111,15.914510546666666,-0.27939985888888863,-0.2822225044444444],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",5,6.144824162222221,15.93144416222222,6.42422402111111,15.914510546666666,-0.27939985888888863,0.016933615555554837],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",6,6.031935273333333,15.93144416222222,6.42422402111111,15.914510546666666,-0.3922887477777772,0.016933615555554837],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",7,6.031935273333333,16.19391111111111,6.42422402111111,15.914510546666666,-0.3922887477777772,0.27940056444444394],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",8,6.142001939999999,16.19391111111111,6.42422402111111,15.914510546666666,-0.2822220811111107,0.27940056444444394],[\"electrode005\",\"104\",\"fill:#0000ff\",\"0\",9,6.441158059999999,16.19391111111111,6.42422402111111,15.914510546666666,0.016934038888889447,0.27940056444444394]],\"index_dtype\":\"int64\",\"columns\":[\"id\",\"data-channels\",\"style\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\",\"vertex_i\",\"x\",\"y\",\"x_center\",\"y_center\",\"x_center_offset\",\"y_center_offset\"],\"type\":\"DataFrame\",\"_df\":{\"0\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":0,\"x\":6.7064461022222215,\"y\":15.635110828888887,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":0.2822220811111116,\"y_center_offset\":-0.2793997177777783},\"1\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":1,\"x\":6.40729111111111,\"y\":15.635110828888887,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.016932909999999524,\"y_center_offset\":-0.2793997177777783},\"2\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":2,\"x\":6.40729111111111,\"y\":15.522221375555555,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.016932909999999524,\"y_center_offset\":-0.39228917111111095},\"3\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":3,\"x\":6.144824162222221,\"y\":15.522221375555555,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.27939985888888863,\"y_center_offset\":-0.39228917111111095},\"4\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":4,\"x\":6.144824162222221,\"y\":15.632288042222221,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.27939985888888863,\"y_center_offset\":-0.2822225044444444},\"5\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":5,\"x\":6.144824162222221,\"y\":15.93144416222222,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.27939985888888863,\"y_center_offset\":0.016933615555554837},\"6\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":6,\"x\":6.031935273333333,\"y\":15.93144416222222,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.3922887477777772,\"y_center_offset\":0.016933615555554837},\"7\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":7,\"x\":6.031935273333333,\"y\":16.19391111111111,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.3922887477777772,\"y_center_offset\":0.27940056444444394},\"8\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":8,\"x\":6.142001939999999,\"y\":16.19391111111111,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":-0.2822220811111107,\"y_center_offset\":0.27940056444444394},\"9\":{\"id\":\"electrode005\",\"data-channels\":\"104\",\"style\":\"fill:#0000ff\",\"{http://www.inkscape.org/namespaces/inkscape}connector-curvature\":\"0\",\"vertex_i\":9,\"x\":6.441158059999999,\"y\":16.19391111111111,\"x_center\":6.42422402111111,\"y_center\":15.914510546666666,\"x_center_offset\":0.016934038888889447,\"y_center_offset\":0.27940056444444394}},\"index_name\":\"\"}");
df_i = new DataFrame(df_i);
