const content1 = '<infNFe versao="4.00" Id="NFe31260602994902000205550010000099611003565891">';
const content2 = '<chNFe>31260602994902000205550010000099611003565891</chNFe>';

const extract = (content, regex) => {
    const match = content.match(regex);
    return match ? match[1] : null;
};

const key1 = extract(content1, /Id="NFe(\d+)"/i) || extract(content1, /<chNFe>(\d+)<\/chNFe>/i);
const key2 = extract(content2, /Id="NFe(\d+)"/i) || extract(content2, /<chNFe>(\d+)<\/chNFe>/i);

console.log("key1:", key1);
console.log("key2:", key2);
