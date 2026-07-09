const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

// The original `useEffect` cleanup was:
// return () => { isMounted = false; unsubPromise.then((unsub) => unsub?.()); };
// And I replaced some part. Let's fix line 202 to 210.
const brokenPart = `    return () => {
      unsubPromise.then((unsub) => {
        if (unsub) unsub();
      });
    };
) => {
      isMounted = false;
      unsubPromise.then((unsub) => unsub?.());
    };`;

if (code.includes(brokenPart)) {
  code = code.replace(brokenPart, `    return () => {
      isMounted = false;
      unsubPromise.then((unsub) => unsub?.());
    };`);
}

fs.writeFileSync('src/pages/Inspections.tsx', code);
