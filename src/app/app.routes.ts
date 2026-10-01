import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', children: [] },
  { path: 'carro', children: [] },
  { path: 'moto', children: [] },
  { path: '**', redirectTo: 'dashboard' }
];


