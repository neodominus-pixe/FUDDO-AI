/* Runs before the first paint, so a dark-mode visitor never gets a white flash
   on the way in. Kept to one statement and inlined for that reason -- anything
   loaded as a module would arrive after the page has already been painted. */
export const themeScript = `try{var t=localStorage.getItem('fuddo-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`
