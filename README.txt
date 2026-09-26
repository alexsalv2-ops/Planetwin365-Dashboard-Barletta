PLANETWIN365 BARLETTA DASHBOARD v1

Repository previsto:
  alexsalv2-ops/Planetwin365-Dashboard-Barletta

File da caricare nella root del repository:
  index.html
  styles.css
  app.js
  data.json
  rendiconto.json
  planetwin365-logo.png
  wave-single.svg

Password Master iniziale:
  PlanetMaster

GitHub token:
  Fine-grained PAT con permesso Contents: Read and write solo sul repository della Dashboard.
  Il token viene salvato esclusivamente nel browser del dispositivo.

IMPORT PDF
- Caricare una Cassa Analitica giornaliera Planetwin365.
- La Dashboard legge automaticamente la data.
- Sport: Sports.
- Virtual: GR Racing + GR League + Inspired Virtuals + Virtual Kiron.
- Legge Venduto, Annullato, Pagato e Rimborsato.
- Gli importi negativi del PDF per Annullato/Pagato/Rimborsato vengono convertiti in valori positivi nei campi, coerentemente con la logica Dashboard.
- Verifica il Totale della Cassa Analitica contro Totale Venduto + Totale Annullato + Totale Pagato + Totale Rimborsato.
- VLT, Online e Conti restano manuali.

NOTE
Per ora aliquote e percentuali partono dagli stessi valori Wincity e sono modificabili in Impostazioni.
La libreria PDF.js viene caricata da cdnjs; l'import PDF richiede quindi connessione Internet.
