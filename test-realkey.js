const invoice = {
  xmlContent: '<nfeProc><protNFe><infProt><chNFe>31260602994902000205550010000099611003565891</chNFe></infProt></protNFe></nfeProc>',
  key: 'RG171QXA6MG'
};
const realKey = (invoice.xmlContent ? (invoice.xmlContent.match(/Id="NFe(\d+)"/i)?.[1] || invoice.xmlContent.match(/<chNFe>(\d+)<\/chNFe>/i)?.[1]) : null) || invoice.key;
console.log(realKey);
