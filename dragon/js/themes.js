// Page-level palettes. A dragon's own colours come from its Genome; these only dress the paper, ink and light.

export const THEMES = {
  light: {
    name: 'light', dark: false,
    paper: '#efe6d2', vignette: 'rgba(110,80,40,0.30)', stain: '#b58b4a', speckA: 'rgba(90,60,30,0.10)', speckB: 'rgba(255,255,240,0.35)',
    rule: 'rgba(90,70,50,0.22)', ink: '#241c14', label: '#7a6c58', initial: '#a63a2b',
    burnt: '#3a1c0c', ash: '#8f8780', scorch: '#7a4a26', char: '#1a120c', ember: '#ff7a1f',
    under: '#3a2a1c', underLight: '#6a5038',
    shadow: 'rgba(40,20,6,0.36)', blend: 'source-over', bloom: 'rgba(255,160,60,0.16)', cursor: 'rgba(40,28,18,0.55)',
    ui: '#241c14', uiBg: 'rgba(246,239,224,0.94)', uiLine: 'rgba(90,70,50,0.25)', uiMuted: '#7a6c58', uiAccent: '#a63a2b'
  },
  dark: {
    name: 'dark', dark: true,
    paper: '#1c1814', vignette: 'rgba(0,0,0,0.55)', stain: '#7a5a30', speckA: 'rgba(255,230,190,0.05)', speckB: 'rgba(0,0,0,0.25)',
    rule: 'rgba(230,215,190,0.14)', ink: '#e9e0d1', label: '#968c7f', initial: '#d4644f',
    burnt: '#8b5a3a', ash: '#77706a', scorch: '#5a3218', char: '#050302', ember: '#ff8a2a',
    under: '#14100c', underLight: '#2c2218',
    shadow: 'rgba(0,0,0,0.6)', blend: 'lighter', bloom: 'rgba(255,150,50,0.20)', cursor: 'rgba(236,224,205,0.6)',
    ui: '#e9e0d1', uiBg: 'rgba(28,24,20,0.94)', uiLine: 'rgba(230,215,190,0.18)', uiMuted: '#968c7f', uiAccent: '#d4644f'
  }
};
