const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target1 = `      if (mod.id === 'vehicles') {
        const driversSnap = await getDocs(query(collection(db, 'drivers')));
        const driversData = driversSnap.docs.map(d => d.data());
        docs = docs.map((v: any) => {
          const assignedDs = driversData.filter(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
          return { 
            ...v, 
            assignedDriver: assignedDs.length > 0 ? assignedDs.map((d: any) => d.name).join(', ') : 'Não Atribuída',
            imageUrl: v.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
          };
        });
      }`;

const replacement1 = `      if (mod.id === 'vehicles' || mod.id === 'telemetry') {
        const driversSnap = await getDocs(query(collection(db, 'drivers')));
        const driversData = driversSnap.docs.map(d => d.data());
        docs = docs.map((v: any) => {
          const assignedDs = driversData.filter(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
          return { 
            ...v, 
            assignedDriver: assignedDs.length > 0 ? assignedDs.map((d: any) => d.name).join(', ') : 'Não Atribuída',
            imageUrl: v.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
          };
        });
      }

      if (mod.id === 'telemetry') {
        try {
          // Fetch settings to get telemetry providers
          const docRef = doc(db, 'settings', 'integrations');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            let providers: any[] = [];
            if (data.providers) {
              providers = data.providers;
            } else if (data.telemetryUrl || data.telemetryToken) {
              providers = [{ id: '1', name: 'Provedor Padrão', url: data.telemetryUrl || '', token: data.telemetryToken || '' }];
            }

            const plateToProvider: Record<string, string> = {};

            // Fetch from each provider
            for (const provider of providers) {
              const url = provider.url || '';
              const token = provider.token || '';
              
              if (url.includes('solusat')) {
                const [apiKey, apiToken] = token.split(',');
                if (apiKey && apiToken) {
                  try {
                    const res = await fetch(\`/api/proxy/solusat/vehicles?t=\${Date.now()}\`, {
                      headers: { 'apiKey': apiKey, 'apiToken': apiToken }
                    });
                    if (res.ok) {
                      const json = await res.json();
                      if (json.status && json.data) {
                        Object.keys(json.data).forEach(groupKey => {
                           const apiVehicles = Array.isArray(json.data[groupKey]) ? json.data[groupKey] : Object.values(json.data[groupKey] || {});
                           apiVehicles.forEach((av: any) => {
                              const plate = (av.ras_vei_placa || av.ras_vei_veiculo || av.veiculo_placa || av.vei_placa || "").toString();
                              const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                              if (cleanPlate) plateToProvider[cleanPlate] = provider.name || 'Solusat';
                           });
                        });
                      }
                    }
                  } catch (e) { console.error('Error fetching Solusat for report:', e); }
                }
              } else if (url.includes('gaussfleet')) {
                try {
                  const now = new Date();
                  const dateParam = \`\${now.getFullYear()}-\${(now.getMonth() + 1).toString().padStart(2, '0')}-\${now.getDate().toString().padStart(2, '0')} \${now.getHours().toString().padStart(2, '0')}:\${now.getMinutes().toString().padStart(2, '0')}:\${now.getSeconds().toString().padStart(2, '0')}\`;
                  const res = await fetch(\`/api/proxy/gaussfleet/hourmeter\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-AUTH-TOKEN': token },
                    body: JSON.stringify({ date_time: dateParam })
                  });
                  if (res.ok) {
                    const json = await res.json();
                    if (json && json.msg && Array.isArray(json.msg)) {
                      json.msg.forEach((av: any) => {
                         const plate = (av.vehicle_name || "").toString();
                         const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                         if (cleanPlate) plateToProvider[cleanPlate] = provider.name || 'GaussFleet';
                      });
                    }
                  }
                } catch (e) { console.error('Error fetching GaussFleet for report:', e); }
              }
            }

            // Map the providers to the documents
            docs = docs.map((v: any) => {
               const cleanVPlate = (v.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
               const prov = plateToProvider[cleanVPlate] || v.telemetryProvider || '';
               return {
                 ...v,
                 telemetryProvider: prov
               };
            });
          }
        } catch (e) {
          console.error("Error setting up telemetry mapping for report", e);
        }
      }`;

code = code.replace(target1, replacement1);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched fetchModuleData');
