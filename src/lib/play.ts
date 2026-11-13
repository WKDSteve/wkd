// What the play area holds. A list on purpose: a further experiment is one
// more entry here (and its component in src/pages/play.astro), under the same
// address. Free of Astro, so tests/nav.test.ts runs it under `node --test`.

export interface PlayItem {
  /** anchor on the page: /play/#<id> */
  id: string;
  name: string;
  blurb: string;
  /** what it takes to run, as the TUI page says it */
  needs: string;
}

export const PLAY: readonly PlayItem[] = [
  {
    id: 'fight',
    name: 'Fight',
    blurb:
      'A small 1v1 fighting game: four fighters, an AI opponent in four difficulties, or a friend, browser to browser.',
    needs: 'a canvas, a keyboard, a controller or a touch screen',
  },
];
