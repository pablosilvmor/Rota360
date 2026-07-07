const extractXmlTag = (xml, tag) => {
  const tagRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const val = xml.match(tagRegex);
  return val ? val[1] : '';
};

const xml = '<nfeProc><protNFe><infProt><chNFe>31260602994902000205550010000099611003565891</chNFe></infProt></protNFe></nfeProc>';
console.log(extractXmlTag(xml, 'chNFe'));
