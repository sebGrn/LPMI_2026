import { Crypto } from './crypto';

export const CRYPTOS: Crypto[] = [
  {
    id: '0',
    apiId: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    image: '/images/btc.png',
    price: 62000,
    change24h: 1.8,
    featured: false,
    description: 'La première cryptomonnaie, créée en 2009 par Satoshi Nakamoto.'
  },
  {
    id: '1',
    apiId: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    image: '/images/eth.png',
    price: 2400,
    change24h: -0.9,
    featured: true,
    description: 'Plateforme de contrats intelligents lancée en 2015.'
  },
  {
    id: '2',
    apiId: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    image: '/images/sol.png',
    price: 140,
    change24h: 4.2,
    featured: false,
    description: 'Blockchain rapide et peu coûteuse, très utilisée pour les applications décentralisées.'
  },
  {
    id: '3',
    apiId: 'cardano',
    name: 'Cardano',
    symbol: 'ADA',
    image: '/images/ada.png',
    price: 0.35,
    change24h: -2.5,
    featured: false,
    description: 'Blockchain fondée sur la recherche académique.'
  }
];
