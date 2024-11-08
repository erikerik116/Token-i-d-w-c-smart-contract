use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use std::mem::size_of;

pub const FIRST_TOTALSUPPLY: u64 = 1000000000000000000;

pub const DECIMALS: u32 = 9;

pub const GLOBAL_SEED: &[u8] = b"GLOBAL_SEED";

pub const VAULT_SEED: &[u8] = b"VAULT_SEED";

declare_id!("DdZtiP97GwpatRNrw82yzSQwXKiGnhY6pMvKtbJJ5Qcv");

#[program]
pub mod kamabla {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.admin = ctx.accounts.admin.key();
        global_state.total_tokens = 0;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let admin_token_account = &ctx.accounts.admin_token_account;
        require!(
            admin_token_account.amount >= amount,
            CustomError::InsufficientFundsInAdminAccount
        );

        // Transfer tokens from the admin's token account to the pool's token account
        let cpi_accounts = Transfer {
            from: ctx.accounts.admin_token_account.to_account_info(),
            to: ctx.accounts.global_state_token_account.to_account_info(),
            authority: ctx.accounts.admin.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_context, amount)?;

        // Update the global_state's total token balance
        global_state.total_tokens += amount;

        Ok(())
    }

    pub fn claim_to_user(ctx: Context<ClaimToUser>, amount: u64) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let seeds: &[&[&[u8]]] = &[&[GLOBAL_SEED, &[ctx.bumps.global_state]]];

        // Check if the global_state has enough tokens
        require!(
            global_state.total_tokens >= amount,
            CustomError::InsufficientTokensInPool
        );
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(
            cpi_program,
            Transfer {
                from: ctx.accounts.global_state_token_account.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: global_state.to_account_info(),
            },
            seeds,
        );
        token::transfer(cpi_context, amount)?;

        // Reduce the global_state's token balance after the transfer
        global_state.total_tokens -= amount;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let seeds: &[&[&[u8]]] = &[&[GLOBAL_SEED, &[ctx.bumps.global_state]]];

        // Check if the global_state has enough tokens
        require!(
            global_state.total_tokens >= amount,
            CustomError::InsufficientTokensInPool
        );

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(
            cpi_program,
            Transfer {
                from: ctx.accounts.global_state_token_account.to_account_info(),
                to: ctx.accounts.admin_token_account.to_account_info(),
                authority: global_state.to_account_info(),
            },
            seeds,
        );
        token::transfer(cpi_context, amount)?;

        // Reduce the global_state's token balance after the transfer
        global_state.total_tokens -= amount;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [GLOBAL_SEED],
        bump,
        space = 8 + size_of::<GlobalState>(),
        payer = admin
    )]
    pub global_state: Box<Account<'info, GlobalState>>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>, // <- Add token program here
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        constraint = admin.key() == global_state.admin.key()
    )]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = admin_token_account.owner == admin.key()
    )]
    pub admin_token_account: Account<'info, TokenAccount>, // Admin's token account

    #[account(mut)]
    pub global_state_token_account: Account<'info, TokenAccount>, // global_state's token account
    pub token_program: Program<'info, Token>, // SPL token program
}



// Define custom errors
#[error_code]
pub enum CustomError {
    #[msg("The caller is not the pool admin.")]
    PoolAdminMismatch, // Error when the caller is not the admin

    #[msg("The pool does not have enough tokens.")]
    InsufficientTokensInPool, // Error when the pool lacks tokens

    #[msg("The admin does not have enough tokens in their account for this deposit.")]
    InsufficientFundsInAdminAccount,

    #[msg("The mint of the deposited tokens does not match the expected mint.")]
    MintMismatch, // New error for mint mismatch
}
