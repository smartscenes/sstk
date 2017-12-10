/**
 * Represents a interval of a generic type E that is comparable.
 * An interval is an ordered pair where the first element is less
 * than the second.
 *
 * Only full intervals are currently supported
 * (i.e., both endpoints have to be specified - cannot be null).
 *
 * Provides functions for computing relationships between intervals.
 *
 * For flags that indicate relationship between two intervals, the following convention is used:
 *   <br/> SS = relationship between start of first interval and start of second interval
 *   <br/> SE = relationship between start of first interval and end of second interval
 *   <br/> ES = relationship between end of first interval and start of second interval
 *   <br/> EE = relationship between end of first interval and end of second interval
 *
 * @constructor
 * @author Angel Chang
 * @memberOf ds
 */
function Interval(a,b,flags,compareFn) {
  this.begin = a;
  this.end = b;
  this.flags = flags;
  if (compareFn) {
    this.compare = compareFn;
  }
}

function numCompare(a,b) {
  if (a === b) { return 0; }
  else return (a > b)? +1 : -1;
}

Interval.compareInterval = function(a,b,compareFn) {
  compareFn = compareFn || numCompare;
  var comp = compareFn(a.begin, b.begin);
  if (comp !== 0) {
    return comp;
  } else {
    comp = compareFn(a.end, b.end);
    return comp;
  }
};

Interval.prototype.compare = numCompare;
Interval.prototype.compareInterval = function(other) {
  return Interval.compareInterval(this, other, this.compare);
};

/**
 * Create an interval with the specified endpoints in the specified order,
 * using the specified flags.  Returns null if a does not come before b
 *  (invalid interval).
 *
 * @param a start endpoints
 * @param b end endpoint
 * @param flags flags characterizing the interval
 * @return Interval with endpoints in specified order, null if a does not come before b
 */
Interval.toInterval = function(a, b, flags, compareFn) {
  compareFn = compareFn || numCompare;
  var comp = compareFn(a,b);
  if (comp <= 0) {
    return new Interval(a, b, flags, compareFn !== numCompare? compareFn : null);
  } else {
    return null;
  }
};

/**
 * Create an interval with the specified endpoints, reordering them as needed,
 * using the specified flags
 * @param a one of the endpoints
 * @param b the other endpoint
 * @param flags flags characterizing the interval
 * @return Interval with endpoints re-ordered as needed
 */
Interval.toValidInterval = function(a,b,flags,compareFn) {
  compareFn = compareFn || numCompare;
  var comp = compareFn(a,b);
  if (comp <= 0) {
    return new Interval(a, b, flags, compareFn !== numCompare? compareFn : null);
  } else {
    return new Interval(b, a, flags, compareFn !== numCompare? compareFn : null);
  }
};

Interval.max = function(a,b,compareFn) {
  compareFn = compareFn || numCompare;
  return compareFn(a, b) >= 0? a : b;
};

Interval.min = function(a,b,compareFn) {
  compareFn = compareFn || numCompare;
  return compareFn(a, b) <= 0? a : b;
};

Interval.prototype.getInterval = function() {
  return this;
};

/**
 * Checks whether the point p is contained inside this interval.
 *
 * @param p point to check
 * @return True if the point p is contained withing the interval, false otherwise
 */
Interval.prototype.containsPoint = function(p) {
  // Check that the start point is before p
  var check1 = (this.includesBegin())? (this.compare(this.begin, p) <= 0):(this.compare(this.begin, p) < 0);
  // Check that the end point is after p
  var check2 = (this.includesEnd())? (this.compare(this.end, p) >= 0):(this.compare(this.end, p) > 0);
  return (check1 && check2);
};

Interval.prototype.containsPointOpen = function(p) {
  // Check that the start point is before p
  var check1 = this.compare(this.begin, p) <= 0;
  // Check that the end point is after p
  var check2 = this.compare(this.end, p) >= 0;
  return (check1 && check2);
};

Interval.prototype.contains = function(other) {
  var containsOtherBegin = (other.includesBegin())? this.containsPoint(other.begin): this.containsPointOpen(other.begine);
  var containsOtherEnd = (other.includesEnd())? this.containsPoint(other.end): this.containsPointOpen(other.end);
  return (containsOtherBegin && containsOtherEnd);
};

/**
 * Returns (smallest) interval that contains both this and the other interval
 * @param other - Other interval to include
 * @return Smallest interval that contains both this and the other interval
 */
Interval.prototype.expand = function(other) {
  if (other == null) return this;
  var a = this.compare(this.begin, other.begin) <= 0? this.begin : other.begin;
  var b = this.compare(this.end, other.end) >= 0? this.end : other.end;
  return Interval.toInterval(a,b);
};

/**
 * Returns interval that is the intersection of this and the other interval
 * Returns null if intersect is null
 * @param other interval with which to intersect
 * @return interval that is the intersection of this and the other interval
 */
Interval.prototype.intersect = function(other) {
  if (other == null) return null;
  var a = this.compare(this.begin, other.begin) >= 0? this.begin : other.begin;
  var b = this.compare(this.end, other.end) <= 0? this.end : other.end;
  return Interval.toInterval(a,b);
};

/**
 * Check whether this interval overlaps with the other interval.
 * (I.e. the intersect would not be null.)
 *
 * @param other interval to compare with
 * @return true if this interval overlaps the other interval
 */
Interval.prototype.overlaps = function(other) {
  if (other == null) return false;
  var comp12 = this.compare(this.begin,other.end);
  var comp21 = this.compare(this.end,other.begin);
  if (comp12 > 0 || comp21 < 0) {
    return false;
  } else {
    if (comp12 === 0) {
      if (!this.includesBegin() || !other.includesEnd()) {
        return false;
      }
    }
    if (comp21 === 0) {
      if (!this.includesEnd() || !other.includesBegin()) {
        return false;
      }
    }
    return true;
  }
};

/**
 * Returns whether the start endpoint is included in the interval
 * @return true if the start endpoint is included in the interval
 */
Interval.prototype.includesBegin = function()  {
  return ((this.flags & Interval.Flags.INTERVAL_OPEN_BEGIN) === 0);
};

/**
 * Returns whether the end endpoint is included in the interval
 * @return true if the end endpoint is included in the interval
 */
Interval.prototype.includesEnd = function() {
  return ((this.flags & Interval.Flags.INTERVAL_OPEN_END) === 0);
};

/**
 * Checks whether this interval is comparable with another interval
 *  comes before or after
 * @param other interval to compare with
 */
Interval.prototype.isIntervalComparable = function(other)
{
  var flags = this.getRelationFlags(other);
  if (Interval.checkMultipleBitSet(flags & Interval.Flags.REL_FLAGS_INTERVAL_UNKNOWN)) {
    return false;
  }
  return Interval.checkFlagSet(flags, Interval.Flags.REL_FLAGS_INTERVAL_BEFORE) || Interval.checkFlagSet(flags, Interval.Flags.REL_FLAGS_INTERVAL_AFTER);
};

/**
 * Returns order of another interval compared to this one
 * @param other Interval to compare with
 * @return -1 if this interval is before the other interval, 1 if this interval is after
 *         0 otherwise (may indicate the two intervals are same or not comparable)
 */
Interval.prototype.compareIntervalOrder = function(other) {
  var flags = this.getRelationFlags(other);
  if (Interval.checkFlagExclusiveSet(flags, Interval.Flags.REL_FLAGS_INTERVAL_BEFORE, Interval.Flags.REL_FLAGS_INTERVAL_UNKNOWN)) {
    return -1;
  } else if (Interval.checkFlagExclusiveSet(flags, Interval.Flags.REL_FLAGS_INTERVAL_AFTER, Interval.Flags.REL_FLAGS_INTERVAL_UNKNOWN)) {
    return 1;
  } else {
    return 0;
  }
};

/**
 * Return set of flags indicating possible relationships between
 *  this interval and another interval.
 *
 * @param other Interval with which to compare with
 * @return flags indicating possible relationship between this interval and the other interval
 */
Interval.prototype.getRelationFlags = function(other)  {
  if (other == null) return 0;
  var flags = 0;
  var comp11 = this.compare(this.begin, other.begin);   // 3 choices
  flags |= Interval.toRelFlags(comp11, Interval.Flags.REL_FLAGS_SS_SHIFT);
  var comp22 = this.compare(this.end, other.end);   // 3 choices
  flags |= Interval.toRelFlags(comp22, Interval.Flags.REL_FLAGS_EE_SHIFT);
  var comp12 = this.compare(this.begin, other.end);   // 3 choices
  flags |= Interval.toRelFlags(comp12, Interval.Flags.REL_FLAGS_SE_SHIFT);
  var comp21 = this.compare(this.end, other.begin);   // 3 choices
  flags |= Interval.toRelFlags(comp21, Interval.Flags.REL_FLAGS_ES_SHIFT);
  flags = Interval.addIntervalRelationFlags(flags, false);
  return flags;
};

Interval.toRelFlags = function(comp, shift) {
  var flags = 0;
  if (comp === 0) {
    flags = Interval.Flags.REL_FLAGS_SAME;
  } else if (comp > 0) {
    flags = Interval.Flags.REL_FLAGS_AFTER;
  } else {
    flags = Interval.Flags.REL_FLAGS_BEFORE;
  }
  flags = flags << shift;
  return flags;
};

Interval.addIntervalRelationFlags = function(flags, checkFuzzy) {
  var f11 = Interval.extractRelationSubflags(flags, Interval.Flags.REL_FLAGS_SS_SHIFT);
  var f22 = Interval.extractRelationSubflags(flags, Interval.Flags.REL_FLAGS_EE_SHIFT);
  var f12 = Interval.extractRelationSubflags(flags, Interval.Flags.REL_FLAGS_SE_SHIFT);
  var f21 = Interval.extractRelationSubflags(flags, Interval.Flags.REL_FLAGS_ES_SHIFT);
  if (checkFuzzy) {
    var isFuzzy = Interval.checkMultipleBitSet(f11) || Interval.checkMultipleBitSet(f12) || Interval.checkMultipleBitSet(f21) || Interval.checkMultipleBitSet(f22);
    if (isFuzzy) {
      flags |= Interval.Flags.REL_FLAGS_INTERVAL_FUZZY;
    }
  }
  if (((f11 & Interval.Flags.REL_FLAGS_SAME) !== 0) && ((f22 & Interval.Flags.REL_FLAGS_SAME) !== 0)) {
    // SS,EE SAME
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_SAME;  // Possible
  }
  if (((f21 & Interval.Flags.REL_FLAGS_BEFORE) !== 0)) {
    // ES BEFORE => SS, SE, EE BEFORE
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_BEFORE;  // Possible
  }
  if (((f12 & Interval.Flags.REL_FLAGS_AFTER) !== 0)) {
    // SE AFTER => SS, ES, EE AFTER
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_AFTER;  // Possible
  }
  if (((f11 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_AFTER)) !== 0) && ((f12 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_BEFORE)) !== 0)) {
    // SS SAME or AFTER, SE SAME or BEFORE
    //     |-----|
    // |------|
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_OVERLAP;  // Possible
  }
  if (((f11 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_BEFORE)) !== 0) && ((f21 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_AFTER)) !== 0)) {
    // SS SAME or BEFORE, ES SAME or AFTER
    // |------|
    //     |-----|
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_OVERLAP;  // Possible
  }
  if (((f11 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_AFTER)) !== 0) && ((f22 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_BEFORE)) !== 0)) {
    // SS SAME or AFTER, EE SAME or BEFORE
    //     |------|
    // |---------------|
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_INSIDE;  // Possible
  }
  if (((f11 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_BEFORE)) !== 0) && ((f22 & (Interval.Flags.REL_FLAGS_SAME | Interval.Flags.REL_FLAGS_AFTER)) !== 0)) {
    // SS SAME or BEFORE, EE SAME or AFTER
    flags |= Interval.Flags.REL_FLAGS_INTERVAL_CONTAIN;  // Possible
    // |---------------|
    //     |------|
  }
  return flags;
};

Interval.extractRelationSubflags = function(flags, shift) {
  return (flags >>> shift) & 0xf;
};

/**
 * Utility function to check if multiple bits are set for flags
 * @param flags flags to check
 * @return true if multiple bits are set
 */
Interval.checkMultipleBitSet = function(flags) {
  var set = false;
  while (flags !== 0) {
    if ((flags & 0x01) !== 0) {
      if (set) { return false; }
      else { set = true; }
    }
    flags = flags >>> 1;
  }
  return false;
};

/**
 * Utility function to check if a particular flag is set
 *   given a particular set of flags.
 * @param flags flags to check
 * @param flag bit for flag of interest (is this flag set or not)
 * @return true if flag is set for flags
 */
Interval.checkFlagSet = function(flags, flag) {
  return ((flags & flag) !== 0);
};

/**
 * Utility function to check if a particular flag is set exclusively
 *   given a particular set of flags and a mask.
 * @param flags flags to check
 * @param flag bit for flag of interest (is this flag set or not)
 * @param mask bitmask of bits to check
 * @return true if flag is exclusively set for flags & mask
 */
Interval.checkFlagExclusiveSet = function(flags, flag, mask) {
  var f = flags & flag;
  if (f !== 0) {
    return (flags & mask & ~flag) === 0;
  } else {
    return false;
  }
};

/**
 * Returns the relationship of this interval to the other interval
 * The most specific relationship from the following is returned.
 *
 * NONE: the other interval is null
 * EQUAL: this have same endpoints as other
 * OVERLAP:  this and other overlaps
 * BEFORE: this ends before other starts
 * AFTER: this starts after other ends
 * BEGIN_MEET_END: this begin is the same as the others end
 * END_MEET_BEGIN: this end is the same as the others begin
 * CONTAIN: this contains the other
 * INSIDE: this is inside the other
 *
 * UNKNOWN: this is returned if for some reason it is not
 *          possible to determine the exact relationship
 *          of the two intervals (possible for fuzzy intervals)
 * @param other The other interval with which to compare with
 * @return RelType indicating relationship between the two interval
 */
Interval.prototype.getRelation = function(other) {
  // TODO: Handle open/closed intervals?
  if (other == null) return Interval.RelType.NONE;
  var comp11 = this.compare(this.begin, other.end);   // 3 choices
  var comp22 = this.compare(this.end, other.begin);   // 3 choices

  if (comp11 === 0) {
    if (comp22 === 0) {
      // |---|  this
      // |---|   other
      return Interval.RelType.EQUAL;
    } if (comp22 < 0) {
      // SAME START - this finishes before other
      // |---|  this
      // |------|   other
      return Interval.RelType.INSIDE;
    } else {
      // SAME START - this finishes after other
      // |------|  this
      // |---|   other
      return Interval.RelType.CONTAIN;
    }
  } else if (comp22 === 0) {
    if (comp11 < 0) {
      // SAME FINISH - this start before other
      // |------|  this
      //    |---|   other
      return Interval.RelType.CONTAIN;
    } else /*if (comp11 > 0) */ {
      // SAME FINISH - this starts after other
      //    |---|  this
      // |------|   other
      return Interval.RelType.INSIDE;
    }
  } else if (comp11 > 0 && comp22 < 0) {
    //    |---|  this
    // |---------|   other
    return Interval.RelType.INSIDE;
  } else if (comp11 < 0 && comp22 > 0) {
    // |---------|  this
    //    |---|   other
    return Interval.RelType.CONTAIN;
  } else {
    var comp12 = this.compare(this.begin, other.end);
    var comp21 = this.compare(this.end, other.begin);
    if (comp12 > 0) {
      //           |---|  this
      // |---|   other
      return Interval.RelType.AFTER;
    } else if (comp21 < 0) {
      // |---|  this
      //        |---|   other
      return Interval.RelType.BEFORE;
    } else if (comp12 === 0) {
      //     |---|  this
      // |---|   other
      return Interval.RelType.BEGIN_MEET_END;
    } else if (comp21 === 0) {
      // |---|  this
      //     |---|   other
      return Interval.RelType.END_MEET_BEGIN;
    } else {
      return Interval.RelType.OVERLAP;
    }
  }
};

Interval.prototype.equals = function(other) {
  return (other && this.begin === other.begin && this.end === other.end && this.flags === other.flags);
};

Interval.prototype.getMidPoint = function() {
  return (this.begin + this.end)/2.0;
};

Interval.prototype.getRadius = function() {
  return (this.end - this.begin)/2.0;
};

/**
 * RelType gives the basic types of relations between two intervals
 * @readonly
 * @enum {number}
 */
Interval.RelType = {
  /** this interval ends before the other starts */
  BEFORE: 1,
  /** this interval starts after the other ends */
  AFTER: 2,
  /** this interval and the other have the same endpoints */
  EQUAL: 3,
  /** this interval's begin is the same as the other's end */
  BEGIN_MEET_END: 4,
  /** this interval's end is the same as the other's begin */
  END_MEET_BEGIN: 5,
  /** this interval contains the other */
  CONTAIN: 6,
  /** this interval is inside the other */
  INSIDE: 7,
  /** this interval and the other overlaps */
  OVERLAP: 8,
  /**
   * The relations between the two intervals are unknown.
   * This is only used for fuzzy intervals, where not
   * all the endpoints are comparable.
   */
  UNKNOWN: 9,
  /**
   * There is no relationship between the two interval.
   * This is used when one of the intervals being
   * compared is null.
   */
  NONE: 0
};
Object.freeze(Interval.RelType);


/**
 * Predefined interval flags
 * @readonly
 * @enum
 */
Interval.Flags = {
  /**
   * Flag indicating that an interval's begin point is not inclusive
   * (by default, begin points are inclusive)
   */
  INTERVAL_OPEN_BEGIN: 0x01,
  /**
   * Flag indicating that an interval's end point is not inclusive
   * (by default, begin points are inclusive)
   */
  INTERVAL_OPEN_END: 0x02,

  REL_FLAGS_SAME: 0x0001,
  REL_FLAGS_BEFORE: 0x0002,
  REL_FLAGS_AFTER: 0x0004,
  REL_FLAGS_UNKNOWN: 0x0007,
  REL_FLAGS_SS_SHIFT: 0,
  REL_FLAGS_SE_SHIFT: 1*4,
  REL_FLAGS_ES_SHIFT: 2*4,
  REL_FLAGS_EE_SHIFT: 3*4,


  // Flags indicating how the endpoints of two intervals
  // are related

  /**
   * Both intervals have the same start point
   * <pre>
   * |---- interval 1 ----?
   * |---- interval 2 ----?
   * </pre>
   */
  REL_FLAGS_SS_SAME: 0x0001,

  /**
   * The first interval starts before the second starts
   * <pre>
   * |---- interval 1 ----?
   *     |---- interval 2 ----?
   *
   * or
   *
   * |-- interval 1 --?
   *                       |---- interval 2 ----?
   * </pre>
   */
  REL_FLAGS_SS_BEFORE: 0x0002,

  /**
   * The first interval starts after the second starts
   * <pre>
   *     |---- interval 1 ----?
   * |---- interval 2 ----?
   *
   * or
   *
   *                       |---- interval 1 ----?
   * |-- interval 2 --?
   * </pre>
   */
  REL_FLAGS_SS_AFTER: 0x0004,

  /**
   * The relationship between the start points of the
   * two intervals is unknown (used for fuzzy intervals)
   */
  REL_FLAGS_SS_UNKNOWN: 0x0007,

  /**
   * The start point of the first interval is the same
   * as the end point of the second interval
   * (the second interval is before the first)
   * <pre>
   *                     |---- interval 1 ----?
   * ?---- interval 2 ---|
   * </pre>
   */
  REL_FLAGS_SE_SAME: 0x0010,

  /**
   * The start point of the first interval is before
   * the end point of the second interval
   * (the two intervals overlap)
   * <pre>
   *                 |---- interval 1 ----?
   * ?---- interval 2 ---|
   * </pre>
   */
  REL_FLAGS_SE_BEFORE: 0x0020,

  /**
   * The start point of the first interval is after
   * the end point of the second interval
   * (the second interval is before the first)
   * <pre>
   *                      |---- interval 1 ---?
   * ?-- interval 2 ---|
   * </pre>
   */
  REL_FLAGS_SE_AFTER: 0x0040,

  /**
   * The relationship between the start point of the first
   * interval and the end point of the second interval
   * is unknown (used for fuzzy intervals)
   */
  REL_FLAGS_SE_UNKNOWN: 0x0070,

  /**
   * The end point of the first interval is the same
   * as the start point of the second interval
   * (the first interval is before the second)
   * <pre>
   * ?---- interval 1 ---|
   *                     |---- interval 2 ----?
   * </pre>
   */
  REL_FLAGS_ES_SAME: 0x0100,

  /**
   * The end point of the first interval is before
   * the start point of the second interval
   * (the first interval is before the second)
   * <pre>
   * ?-- interval 1 ---|
   *                      |---- interval 2 ---?
   * </pre>
   */
  REL_FLAGS_ES_BEFORE: 0x0200,

  /**
   * The end point of the first interval is after
   * the start point of the second interval
   * (the two intervals overlap)
   * <pre>
   * ?---- interval 1 ---|
   *                 |---- interval 2 ----?
   * </pre>
   */
  REL_FLAGS_ES_AFTER: 0x0400,

  /**
   * The relationship between the end point of the first
   * interval and the start point of the second interval
   * is unknown (used for fuzzy intervals)
   */
  REL_FLAGS_ES_UNKNOWN: 0x0700,


  /**
   * Both intervals have the same end point
   * <pre>
   * ?---- interval 1 ----|
   * ?---- interval 2 ----|
   * </pre>
   */
  REL_FLAGS_EE_SAME: 0x1000,

  /**
   * The first interval ends before the second ends
   * <pre>
   * ?---- interval 1 ----|
   *     ?---- interval 2 ----|
   *
   * or
   *
   * ?-- interval 1 --|
   *                       ?---- interval 2 ----|
   * </pre>
   */
  REL_FLAGS_EE_BEFORE: 0x2000,

  /**
   * The first interval ends after the second ends
   * <pre>
   *     ?---- interval 1 ----|
   * ?---- interval 2 ----|
   *
   * or
   *
   *                       ?---- interval 1 ----|
   * ?-- interval 2 --|
   * </pre>
   */
  REL_FLAGS_EE_AFTER: 0x4000,

  /**
   * The relationship between the end points of the
   * two intervals is unknown (used for fuzzy intervals)
   */
  REL_FLAGS_EE_UNKNOWN: 0x7000,

  // Flags indicating how two intervals are related

  /**
   * The intervals are the same (have the same start and end points).
   * When this flag is set, OVERLAP, INSIDE, and CONTAIN should also be set.
   * <pre>
   * |---- interval 1 ----|
   * |---- interval 2 ----|
   * </pre>
   */
  REL_FLAGS_INTERVAL_SAME: 0x00010000,    // SS,EE  SAME
                                                                   // Can be set with OVERLAP, INSIDE, CONTAIN
  /**
   * The first interval is entirely before the second interval
   * (the end of the first interval happens before the start of the second)
   * <pre>
   * ?---- interval 1 ----|
   *                          |---- interval 2 ----?
   * </pre>
   */
  REL_FLAGS_INTERVAL_BEFORE: 0x00020000,  // ES BEFORE => SS, SE, EE BEFORE

  /**
   * The first interval is entirely after the second interval
   * (the start of the first interval happens after the end of the second)
   * <pre>
   *                          |---- interval 1 ----?
   * ?---- interval 2 ----|
   * </pre>
   */
  REL_FLAGS_INTERVAL_AFTER: 0x00040000,   // SE AFTER => SS, ES, EE AFTER

  /**
   * The first interval overlaps with the second interval.
   */
  REL_FLAGS_INTERVAL_OVERLAP: 0x00100000, // SS SAME or AFTER, SE SAME or BEFORE
                                                                   // SS SAME or BEFORE, ES SAME or AFTER
  /**
   * The first interval is inside the second interval.
   * When this flag is set, OVERLAP should also be set.
   * <pre>
   *          |---- interval 1 ----|
   *       |---- interval 2 -----------|
   * </pre>
   */
  REL_FLAGS_INTERVAL_INSIDE: 0x00200000,  // SS SAME or AFTER, EE SAME or BEFORE

  /**
   * The first interval contains the second interval.
   * When this flag is set, OVERLAP should also be set.
   * <pre>
   *       |---- interval 1 -----------|
   *          |---- interval 2 ----|
   * </pre>
   */
  REL_FLAGS_INTERVAL_CONTAIN: 0x00400000, // SS SAME or BEFORE, EE SAME or AFTER

  /**
   * It is uncertain what the relationship between the
   * two intervals are...
   */
  REL_FLAGS_INTERVAL_UNKNOWN: 0x00770000,

  REL_FLAGS_INTERVAL_ALMOST_SAME: 0x01000000,
  REL_FLAGS_INTERVAL_ALMOST_BEFORE: 0x01000000,
  REL_FLAGS_INTERVAL_ALMOST_AFTER: 0x01000000,

//  REL_FLAGS_INTERVAL_ALMOST_OVERLAP: 0x10000000,
//  REL_FLAGS_INTERVAL_ALMOST_INSIDE: 0x20000000,
//  REL_FLAGS_INTERVAL_ALMOST_CONTAIN: 0x40000000,

  REL_FLAGS_INTERVAL_FUZZY: 0x80000000
};
Object.freeze(Interval.Flags);

module.exports = Interval;