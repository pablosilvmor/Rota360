const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

code = code.replace(`    </>
  );
}
}`, `    </>
  );
}`);

code = code.replace(`    )}
  </AnimatePresence>
    </div>
  );
}`, `    )}
  </AnimatePresence>
    </div>
  );
}`);

fs.writeFileSync('src/pages/Inspections.tsx', code);
