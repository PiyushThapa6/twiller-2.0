const fs = require('fs');
let code = fs.readFileSync('./index.js', 'utf8');
code = code.replace(
  'const user = await User.findOne({ email: email });\n    return res.status(200).send(user);',
  'const user = await User.findOne({ email: email });\n    if (!user) return res.status(404).send({ error: "User not found" });\n    return res.status(200).send(user);'
);
fs.writeFileSync('./index.js', code);
console.log('Done');
