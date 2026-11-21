
const {onCall,HttpsError} =
require("firebase-functions/v2/https");

const admin=require("firebase-admin");

admin.initializeApp();

const db=admin.firestore();

const ADMIN_UID="WEKA_ADMIN_UID";

exports.getGameDownloadUrl=onCall(async(request)=>{

 if(!request.auth)
  throw new HttpsError("unauthenticated","Ingia kwanza.");

 const gameId=request.data.gameId;

 if(typeof gameId!=="string" || !gameId)
  throw new HttpsError("invalid-argument","Game ID si sahihi.");

 const gameSnap=await db.collection("games").doc(gameId).get();

 if(!gameSnap.exists)
  throw new HttpsError("not-found","Gemu halipo.");

 const game=gameSnap.data();

 if(!game.storagePath)
  throw new HttpsError("failed-precondition","Faili halipo.");

 const isAdmin=request.auth.uid===ADMIN_UID;

 if(game.paid && !isAdmin){

  const entitlement=await db.collection("entitlements")
   .doc(`${request.auth.uid}_${gameId}`).get();

  if(!entitlement.exists)
   throw new HttpsError(
    "permission-denied",
    "Subiri Admin athibitishe malipo."
   );
 }

 const bucket=admin.storage().bucket();

 const [url]=await bucket.file(game.storagePath).getSignedUrl({
  action:"read",
  expires:Date.now()+5*60*1000
 });

 return {url};
});
