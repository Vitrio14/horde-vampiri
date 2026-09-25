const firebaseConfig = {
  apiKey: "AIzaSyBtSEkw7w-bLQvE8YchIT69i3S6Xv36WMo",
  authDomain: "gm-horde-e710c.firebaseapp.com",
  projectId: "gm-horde-e710c",
  storageBucket: "gm-horde-e710c.firebasestorage.app",
  messagingSenderId: "840800083986",
  appId: "1:840800083986:web:dd950f9a99e7e6a27778cb",
  measurementId: "G-ZVFLK4D8QM"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();