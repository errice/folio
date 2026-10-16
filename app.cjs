// Passenger loads a CommonJS startup file; the application uses ES modules.
import('./standalone/cpanel.mjs').then(async({createCpanelServer})=>{
 const server=await createCpanelServer();
 server.listen(process.env.PORT||3000);
}).catch(()=>{console.error('Folio could not start. Check its hosting configuration.');process.exit(1);});
