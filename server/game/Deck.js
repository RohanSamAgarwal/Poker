// =============================================================================
//  Deck.js — 52-card deck with a cryptographically fair shuffle.
// =============================================================================
//  Cards are 2-character strings: rank + suit.
//    rank: 2 3 4 5 6 7 8 9 T J Q K A
//    suit: c (clubs) d (diamonds) h (hearts) s (spades)
//  e.g. "As" = ace of spades, "Td" = ten of diamonds.
// =============================================================================

import { randomInt } from 'node:crypto';

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['c', 'd', 'h', 's'];

/** Rank value used for comparisons (2 = 2 … A = 14). */
export const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

/** Build a fresh, ordered 52-card deck. */
export function freshDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) deck.push(r + s);
  }
  return deck;
}

export class Deck {
  /**
   * @param {string[]} [cards] optional pre-set card order (for deterministic tests).
   *   When omitted a fresh 52-card deck is created and shuffled.
   */
  constructor(cards) {
    if (cards) {
      this.cards = [...cards];
    } else {
      this.cards = freshDeck();
      this.shuffle();
    }
    this.dealt = 0;
  }

  /** Fisher–Yates shuffle using crypto randomInt (unbiased, unpredictable). */
  shuffle() {
    const a = this.cards;
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return this;
  }

  /** Deal a single card off the top. */
  deal() {
    if (this.dealt >= this.cards.length) {
      throw new Error('Deck exhausted');
    }
    return this.cards[this.dealt++];
  }

  /** Deal `n` cards as an array. */
  dealMany(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.deal());
    return out;
  }

  /** Cards not yet dealt (used by bots for Monte-Carlo roll-outs). */
  remaining() {
    return this.cards.slice(this.dealt);
  }
}
