/**
 * The pair queue and its preview window.
 *
 * Puyo Puyo shows you the next two pairs; planning around them is most of the
 * game, so the queue always keeps that many ready.
 */
export class PairQueue {
  /**
   * @param {() => {axis: import('./board.js').Cell, child: import('./board.js').Cell}} generate
   * @param {number} previewCount how many upcoming pairs to keep visible
   */
  constructor(generate, previewCount = 2) {
    this.generate = generate;
    this.previewCount = previewCount;
    this.pending = [];
    this.fill();
  }

  fill() {
    while (this.pending.length < this.previewCount + 1) {
      this.pending.push(this.generate());
    }
  }

  /** @returns {object} the pair `index` places ahead without consuming it. */
  peek(index = 0) {
    this.fill();
    return this.pending[index];
  }

  /**
   * The pairs waiting behind the one in play, nearest first.
   *
   * `take` removes the pair it hands out, so everything still queued is
   * genuinely upcoming: the window starts at index 0, not 1.
   *
   * @returns {object[]}
   */
  preview() {
    this.fill();
    return this.pending.slice(0, this.previewCount);
  }

  /** @returns {object} takes the front pair. */
  take() {
    this.fill();
    const pair = this.pending.shift();
    this.fill();
    return pair;
  }
}
