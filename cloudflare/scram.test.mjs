import test from 'node:test';
import assert from 'node:assert/strict';
await import('./scram.js');
test('SCRAM-SHA-256 proof and server signature match RFC 7677 section 3',async()=>{
 const nonce='rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
 const challenge={salt:'W22ZaJ0SNY7soEsUEjb6gQ==',iterations:4096,nonce,clientFirst:'n=user,r=rOprNGfwEbeRWgbNEkqO',serverFirst:`r=${nonce},s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096`};
 const result=await folioScram.proofFor('pencil',challenge);
 assert.equal(result.proof,'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=');
 assert.equal(result.serverSignature,'6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
});
