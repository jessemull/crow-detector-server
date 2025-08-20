#!/usr/bin/env node

const { spawn } = require('child_process');
const { Command } = require('commander');
require('dotenv').config();

const program = new Command();

program
  .name('tunnel')
  .description('SSH tunneling utility for AWS bastion/NAT server')
  .version('1.0.0');

program
  .option('-h, --host <host>', 'Bastion host IP or DNS', process.env.BASTION_HOST)
  .option('-u, --user <user>', 'SSH username', process.env.SSH_USER || 'ec2-user')
  .option('-k, --key <key>', 'SSH key path', process.env.SSH_KEY_PATH || '~/.ssh/aws-key.pem')
  .option('-p, --port <port>', 'SSH port', '22')
  .option('-l, --local-port <port>', 'Local port for forwarding')
  .option('-r, --remote-port <port>', 'Remote port for forwarding')
  .option('-d, --destination <host>', 'Destination host for forwarding', process.env.DESTINATION_HOST)
  .option('-t, --type <type>', 'Tunnel type (rds, ssh, custom)', 'ssh')
  .option('-v, --verbose', 'Verbose output', false)
  .option('--dry-run', 'Show command without executing', false);

program.parse();

const options = program.opts();

// Validate required options...

if (!options.host) {
  console.error('Error: Bastion host is required. Set BASTION_HOST env var or use --host option.');
  process.exit(1);
}

function buildCommand() {
  let command = ['ssh', '-i', options.key, `${options.user}@${options.host}`, '-p', options.port];

  // Add port forwarding if specified...

  if (options.localPort && options.remotePort && options.destination) {
    command.push('-L', `${options.localPort}:${options.destination}:${options.remotePort}`);
  }

  // Add verbose flag if requested...

  if (options.verbose) {
    command.push('-v');
  }

  // Add additional SSH options for better experience...

  command.push(
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ServerAliveInterval=60',
    '-o', 'ServerAliveCountMax=3'
  );

  return command;
}

function executeTunnel() {
  const command = buildCommand();
  
  if (options.dryRun) {
    console.log('Dry run - would execute:');
    console.log(command.join(' '));
    return;
  }

  // Determine tunnel type for display...

  let tunnelType = 'SSH';
  if (options.localPort && options.remotePort && options.destination) {
    if (options.destination.includes('rds.amazonaws.com')) {
      tunnelType = 'RDS Database';
    } else {
      tunnelType = 'Port Forward';
    }
  }

  console.log(`Starting ${tunnelType} tunnel to ${options.host}...`);
  console.log(`Command: ${command.join(' ')}`);
  console.log('');

  if (options.localPort && options.remotePort && options.destination) {
    console.log(`Port forwarding: localhost:${options.localPort} -> ${options.destination}:${options.remotePort}`);
    console.log('');
  }

  const sshProcess = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    shell: false
  });

  sshProcess.on('error', (error) => {
    console.error('Failed to start tunnel:', error.message);
    process.exit(1);
  });

  sshProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('Tunnel closed successfully');
    } else {
      console.log(`Tunnel closed with code ${code}`);
    }
  });

  // Handle process termination...

  process.on('SIGINT', () => {
    console.log('\nShutting down tunnel...');
    sshProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down tunnel...');
    sshProcess.kill('SIGTERM');
  });
}

// Show help if help requested...

if (options.help) {
  program.help();
} else {
  executeTunnel();
}
