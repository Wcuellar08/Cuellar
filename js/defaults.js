// Valores iniciales. Todo esto se puede cambiar desde Ajustes en la app.

const cat = (id, name, prefix, subs) => ({ id, name, prefix, subs });

export const DEFAULT_SETTINGS = {
  storeName: 'BOOHO',
  categories: [
    cat('blusas', 'Blusas', 'BLU', ['Manga corta', 'Manga larga', 'Sin mangas', 'Crop top']),
    cat('camisas', 'Camisas', 'CAM', ['Casual', 'Formal', 'Polo']),
    cat('playeras', 'Playeras', 'PLA', ['Básica', 'Estampada', 'Deportiva']),
    cat('pantalones', 'Pantalones', 'PAN', ['Mezclilla', 'Vestir', 'Joggers', 'Leggings']),
    cat('shorts', 'Shorts', 'SHO', ['Mezclilla', 'Tela', 'Deportivo']),
    cat('faldas', 'Faldas', 'FAL', ['Corta', 'Midi', 'Larga']),
    cat('vestidos', 'Vestidos', 'VES', ['Casual', 'Fiesta', 'Largo']),
    cat('sueteres', 'Suéteres', 'SUE', ['Suéter', 'Sudadero', 'Cárdigan']),
    cat('chumpas', 'Chumpas y abrigos', 'CHU', ['Mezclilla', 'Cuero', 'Rompevientos', 'Abrigo']),
    cat('conjuntos', 'Conjuntos', 'CON', ['Deportivo', 'Casual', 'Pijama']),
    cat('deportiva', 'Ropa deportiva', 'DEP', ['Licras', 'Tops', 'Pants']),
    cat('zapatos', 'Zapatos', 'ZAP', ['Tenis', 'Sandalias', 'Botas', 'Formales']),
    cat('bolsas', 'Bolsas', 'BOL', ['Bolso', 'Mochila', 'Cartera']),
    cat('accesorios', 'Accesorios', 'ACC', ['Cinturones', 'Gorras', 'Bufandas', 'Bisutería']),
  ],
  paymentMethods: ['Efectivo', 'Transferencia', 'Tarjeta'],
  // Dónde se publican las prendas (para recordar marcarlas como vendidas)
  platforms: ['Instagram', 'Vitrinnea'],
  channels: ['Tienda', 'Bazar', 'Facebook', 'Instagram', 'WhatsApp'],
  carriers: ['Guatex', 'Cargo Expreso', 'Forza Delivery', 'Mensajero propio', 'Entrega en persona'],
  monthlyGoal: 0,
};

export const CONDITIONS = ['Nueva con etiqueta', 'Como nueva', 'Buen estado', 'Con detalle'];
export const GENDERS = ['Dama', 'Caballero', 'Niña', 'Niño', 'Unisex'];
// Tallas de pantalón (dama): cintura en pulgadas y su equivalente en talla numérica.
// Se muestran como botones al registrar pantalones, shorts o faldas.
export const PANTS_SIZES = [
  '24 (00-0)', '25 (0-2)', '26 (2-4)', '27 (4-6)', '28 (6-8)', '29 (8-10)', '30 (10-12)',
  '31 (12-14)', '32 (14-16)', '33 (16)', '34 (16-18)', '36 (18-20)', '38 (20-22)',
];
/** ¿La categoría usa tallas de pantalón? (por nombre o id: pantalones, shorts, faldas, jeans) */
export const usesPantsSizes = (cat) => !!cat && /pantal|short|falda|jean/i.test(`${cat.id} ${cat.name}`);

export const SIZE_SUGGESTIONS = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL',
  '0', '1', '3', '5', '7', '9', '11', '13', '15',
  '26', '28', '30', '32', '34', '36', '38', '40',
  '2', '4', '6', '8', '10', '12', '14', '16',
  '35', '36', '37', '38', '39', '40', '41', '42', '43', '44',
  'Única',
];
