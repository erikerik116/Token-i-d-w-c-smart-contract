import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Kamabla } from "../target/types/kamabla";
import keys from '../keys/admin.json';
import key1 from '../keys/user1.json';
import { BN } from "bn.js";
import { assert } from "chai";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createAssociatedTokenAccount, createMint, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo, NATIVE_MINT } from "@solana/spl-token";


const connection = new Connection("http://localhost:8899")
const GLOBAL_SEED = "GLOBAL_SEED"
const DECIMALS = 9;
const FIRST_TOTALSUPPLY = new BN(1000000000).mul(new BN(10 ** DECIMALS));
const id = new BN(0)


describe("kamabla", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Kamabla as Program<Kamabla>;

  const admin = Keypair.fromSecretKey(bs58.decode(keys.key));
  const user1 = Keypair.fromSecretKey(bs58.decode(key1.key));

  let mint: PublicKey;
  let tokenAta: PublicKey;
  let globalstate: PublicKey;
  let user1Ata: PublicKey;
  let globalAta: PublicKey;
  const tokenDecimal = 9

  const adminWallet = admin.publicKey;
  const amount = new BN(1000000000).mul(new BN(10 ** tokenDecimal))

  console.log("Admin's wallet address is : ", admin.publicKey.toBase58());

  it(" wallet's state", async () => { console.log("admin wallet balance : ", (await connection.getBalance(adminWallet)) / 10 ** 9, "SOL") });

  it("Airdrop to admin wallet", async () => {
    console.log(`Requesting airdrop to admin for 1SOL : ${admin.publicKey}`)
    // 1 - Request Airdrop
    const signature = await connection.requestAirdrop(
      admin.publicKey,
      10 ** 9
    );
    // 2 - Fetch the latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    // 3 - Confirm transaction success
    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature
    }, 'finalized');
    console.log("admin wallet balance : ", (await connection.getBalance(admin.publicKey)) / 10 ** 9, "SOL")
  })


  it("Airdrop to user1 wallet", async () => {
    console.log(`Requesting airdrop to user1 for 1SOL : ${admin.publicKey}`)
    // 1 - Request Airdrop
    const signature = await connection.requestAirdrop(
      user1.publicKey,
      10 ** 9
    );
    // 2 - Fetch the latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    // 3 - Confirm transaction success
    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature
    }, 'finalized');
    console.log("user1 wallet balance : ", (await connection.getBalance(user1.publicKey)) / 10 ** 9, "SOL")
  })


  it("Mint token to admin wallet", async () => {
    console.log("Trying to reate and mint token to admin's wallet")
    console.log("Here, contract uses this token as LP token")
    console.log(await connection.getBalance(admin.publicKey) / LAMPORTS_PER_SOL)
    // console.log(await connection.getBalance(user1.publicKey) / LAMPORTS_PER_SOL)
    //create mint
    try {
      mint = await createMint(connection, admin, admin.publicKey, admin.publicKey, tokenDecimal)
      console.log('mint address: ' + mint.toBase58());

      tokenAta = (await getOrCreateAssociatedTokenAccount(connection, admin, mint, admin.publicKey)).address
      console.log('token account address: ' + tokenAta.toBase58());

      //minting 100 new tokens to the token address we just created
      await mintTo(connection, admin, mint, tokenAta, admin.publicKey, BigInt(amount.toString()))
      const tokenBalance = await connection.getTokenAccountBalance(tokenAta)
      // tokenBalance.value.uiAmount
      console.log("tokenBalance in user:", tokenBalance.value.uiAmount)
      console.log('token successfully minted');
    } catch (error) {
      console.log("Token creation error \n", error)
    }
  })


  it("Is initialized!", async () => {
    console.log("Admin initializes the smart contract")
    try {
      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_SEED)],
        program.programId
      )

      globalstate = globalState;
      // const globalAta = await getAssociatedTokenAddress(mint, globalState, true)
      console.log("🚀 ~ it ~ globalState:", globalState.toBase58())

      console.log('globalstate mint address: ' + mint.toBase58());
      // console.log('globalAta address: ' + globalAta.toBase58());
      console.log('admin address: ' + admin.publicKey.toBase58());
      console.log('globalstatetoken successfully minted');

      const tx = new Transaction().add(
        await program.methods.initialize()
          .accounts({
            globalState: globalState,
            admin: admin.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY
          })
          .signers([admin])
          .instruction()
      )

      tx.feePayer = admin.publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      console.log(await connection.simulateTransaction(tx))
      await sendAndConfirmTransaction(connection, tx, [admin])
      console.log("Below is global state value")
      const globalStateValue = await program.account.globalState.fetch(globalState)
      console.log("globalStateValue: \n", globalStateValue)


    } catch (error) {
      console.log("error in initialization :", error)
    }
  })


  it("Admin deposit 700000000 tokens", async () => {
    console.log("Trying to deposit 700000000 tokens")
    try {
      // const [globalState] = PublicKey.findProgramAddressSync(
      //   [Buffer.from(GLOBAL_SEED)],
      //   program.programId
      // )
      const depositAmount = new BN(700000000).mul(new BN(10 ** tokenDecimal)); // Deposit 500 tokens
      console.log("🚀 ~ it ~ globalState:", globalstate.toBase58())
      console.log("🚀 ~ it ~ depositAmount:", depositAmount)
      const transaction = new Transaction()
      const globalAta = await getAssociatedTokenAddress(mint, globalstate, true)
      console.log("globalAta:", globalAta.toBase58())

      if (await connection.getAccountInfo(globalAta) == null) {
        console.log("admin create globalAta")
        transaction.add(createAssociatedTokenAccountInstruction(
          admin.publicKey,
          globalAta,
          globalstate,
          mint
        ))
      }
      const instruction = await program.methods.deposit(depositAmount)
        .accounts({
          admin: adminWallet,
          globalState: globalstate,
          mint,
          adminTokenAccount: tokenAta,
          globalStateTokenAccount: globalAta,
          tokenProgram: TOKEN_PROGRAM_ID
        }).instruction()

      transaction.add(instruction)

      transaction.feePayer = admin.publicKey
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      console.log(await connection.simulateTransaction(transaction))
      const sig = await sendAndConfirmTransaction(connection, transaction, [admin])
      console.log({ sig })
      // globalata = globalAta;
      console.log("trying to get the token balance of admin wallet")
      const balInfo = await connection.getTokenAccountBalance(tokenAta)
      console.log("admin wallet token balance is : ", balInfo.value.uiAmount)

      const globalAtaBalInfo = await connection.getTokenAccountBalance(globalAta)
      console.log("globalAta token balance is : ", globalAtaBalInfo.value.uiAmount)
    } catch (error) {
      console.log("error in initialization :", error)
    }
  })


  it("Admin claims 200000000 tokens", async () => {
    console.log("Admin claims 200000000 tokens")
    try {
      // const [globalState] = PublicKey.findProgramAddressSync(
      //   [Buffer.from(GLOBAL_SEED)],
      //   program.programId
      // )
      const claimAmount = new BN(200000000).mul(new BN(10 ** tokenDecimal)); // claims 230000 tokens
      console.log("🚀 ~ it ~ globalState:", globalstate.toBase58())
      console.log("🚀 ~ it ~ claimAmount:", claimAmount)
      const globalAta = await getAssociatedTokenAddress(mint, globalstate, true)
      console.log("🚀 ~ it ~ globalAta:", globalAta.toBase58())
      const globalAtaBalInfo = await connection.getTokenAccountBalance(globalAta)
      console.log("globalAta token balance is : ", globalAtaBalInfo.value.uiAmount)

      const user1Ata = await getAssociatedTokenAddress(mint, user1.publicKey)
      const transaction = new Transaction()

      if (await connection.getAccountInfo(user1Ata) == null) {
        console.log("user1 create user1Ata")
        transaction.add(createAssociatedTokenAccountInstruction(
          user1.publicKey,
          user1Ata,
          user1.publicKey,
          mint
        ))
      }

      const instruction = await program.methods.claimToUser(claimAmount)
        .accounts({
          globalState: globalstate,
          mint: mint,
          user: user1.publicKey,
          globalStateTokenAccount: globalAta,
          userTokenAccount: user1Ata,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).instruction()

      transaction.add(instruction)

      transaction.feePayer = user1.publicKey
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      console.log(await connection.simulateTransaction(transaction))
      const sig = await sendAndConfirmTransaction(connection, transaction, [user1])
      console.log({ sig })
      console.log("trying to get the token balance of admin wallet")
      const user1Info = await connection.getTokenAccountBalance(user1Ata)
      console.log("🚀user1Ata token balance is : ", user1Info.value.uiAmount)
      // console.log("user1 wallet token balance is : ", user1Info.value.uiAmount)
      const globalAtaInfo = await connection.getTokenAccountBalance(globalAta)
      console.log("globalAta token balance is : ", globalAtaInfo.value.uiAmount)
    } catch (error) {
      console.log("error in initialization :", error)
    }
  })


  it("Admin withdraw 100000000 tokens", async () => {
    console.log("Admin withdraw 100000000 tokens")
    try {
      // const [globalState] = PublicKey.findProgramAddressSync(
      //   [Buffer.from(GLOBAL_SEED)],
      //   program.programId
      // )
      const withdrawAmount = new BN(100000000).mul(new BN(10 ** tokenDecimal)); // withdraw  tokens
      console.log("🚀 ~ it ~ globalState:", globalstate.toBase58())
      console.log("🚀 ~ it ~ claimAmount:", withdrawAmount)
      const globalAta = await getAssociatedTokenAddress(mint, globalstate, true)
      console.log("🚀 ~ it ~ globalAta:", globalAta.toBase58())
      const globalAtaBalInfo = await connection.getTokenAccountBalance(globalAta)
      console.log("globalAta token balance is : ", globalAtaBalInfo.value.uiAmount)

      const adminAta = await getAssociatedTokenAddress(mint, admin.publicKey)
      const transaction = new Transaction()

      if (await connection.getAccountInfo(adminAta) == null) {
        console.log("admin create adminAta")
        transaction.add(createAssociatedTokenAccountInstruction(
          admin.publicKey,
          adminAta,
          admin.publicKey,
          mint
        ))
      }

      const instruction = await program.methods.withdraw(withdrawAmount)
        .accounts({
          globalState: globalstate,
          mint: mint,
          admin: admin.publicKey,
          globalStateTokenAccount: globalAta,
          adminTokenAccount: adminAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).instruction()

      transaction.add(instruction)
      transaction.feePayer = admin.publicKey
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      console.log(await connection.simulateTransaction(transaction))
      const sig = await sendAndConfirmTransaction(connection, transaction, [admin])
      console.log({ sig })
      console.log("trying to get the token balance of admin wallet")
      const adminInfo = await connection.getTokenAccountBalance(adminAta)
      console.log("adminAta token balance is : ", adminInfo.value.uiAmount)
      // console.log("user1 wallet token balance is : ", user1Info.value.uiAmount)

      const globalAtaInfo = await connection.getTokenAccountBalance(globalAta)
      console.log("globalAta token balance is : ", globalAtaInfo.value.uiAmount)


    } catch (error) {
      console.log("error in initialization :", error)
    }
  })


});
