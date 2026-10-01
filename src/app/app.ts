import { Component, signal, inject, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { NgxDatatableModule, ColumnMode } from '@swimlane/ngx-datatable';
import Swal from 'sweetalert2';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxDatatableModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, AfterViewInit {
  protected readonly title = signal('estudo_angular2');
  protected ColumnMode = ColumnMode;
  
  // Aba ativa: 'dashboard' | 'carro' | 'moto'
  protected tipoVeiculo = signal<'dashboard' | 'carro' | 'moto'>('dashboard');

  // Controle de estado de expansão/fixação da sidebar
  protected sidebarFixada = signal(false);

  toggleSidebar() {
    this.sidebarFixada.update(v => !v);
  }

  // Dashboard Stats Signals
  protected totalCarros = signal(0);
  protected totalMotos = signal(0);
  protected totalVeiculos = signal(0);
  protected carrosAtivos = signal(0);
  protected motosAtivas = signal(0);
  protected porTipoCarros = signal<{ [key: string]: number }>({});
  protected porTipoMotos = signal<{ [key: string]: number }>({});

  // Paginação e Infinite Scroll Signals
  protected totalRegistros = signal(0);
  protected pageOffset = signal(0);
  protected pageSize = signal(50);
  protected carregando = signal(false);
  protected modoInfinito = signal(true); // Se true, 'Carregar Mais' acumula na lista; se false, é paginação estrita.

  // Signal para guardar o status do filtro selecionado ('todos' | 'ativo' | 'inativo')
  protected filtroStatus = signal<'todos' | 'ativo' | 'inativo'>('todos');

  // Signal para guardar o tipo de categoria selecionado no filtro ('todos' | 'Sedan' | 'SUV' ...)
  protected filtroTipo = signal<string>('todos');

  // Signal para guardar a lista de veículos do backend
  protected listaDeVeiculos = signal<any[]>([]);

  // Opções dos Enums para cada tipo de veículo
  protected tiposCarro: string[] = ['Sedan', 'SUV', 'Hatchback', 'Pickup', 'Coupé', 'Conversível', 'Perua', 'Minivan', 'Outro'];
  protected tiposMoto: string[] = ['Street', 'Scooter', 'Trail', 'Custom', 'Sport', 'Naked', 'Touring', 'Outro'];

  // Modais Bootstrap States
  protected modalFormAberto = signal(false);
  protected modalFormModo = signal<'criar' | 'editar'>('criar');
  protected veiculoEmEdicaoId = signal<number | null>(null);
  protected formNome = signal('');
  protected formDescricao = signal('');
  protected formAno = signal<number | null>(null);
  protected formTipo = signal<string>('Outro');

  private http = inject(HttpClient);
  private router = inject(Router);

  @ViewChild('graficoCarros', { static: false }) graficoCarrosCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graficoMotos', { static: false }) graficoMotosCanvas!: ElementRef<HTMLCanvasElement>;
  private chartCarrosInstance: Chart | null = null;
  private chartMotosInstance: Chart | null = null;

  private getApiUrl(endpointPath: string): string {
    const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    if (typeof window !== 'undefined') {
      if (window.location.port === '4200' || window.location.port === '80' || !window.location.port) {
        return `/api${cleanPath}`;
      }
    }
    return `http://localhost:8000/api${cleanPath}`;
  }

  ngOnInit() {
    this.sincronizarRotaComEstado(this.router.url);

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.sincronizarRotaComEstado(event.urlAfterRedirects || event.url);
      });
  }

  private sincronizarRotaComEstado(url: string) {
    let novoTipo: 'dashboard' | 'carro' | 'moto' = 'dashboard';
    if (url.includes('/moto')) {
      novoTipo = 'moto';
    } else if (url.includes('/carro')) {
      novoTipo = 'carro';
    } else {
      novoTipo = 'dashboard';
    }

    if (this.tipoVeiculo() !== novoTipo) {
      this.tipoVeiculo.set(novoTipo);
      this.filtroTipo.set('todos');
      this.pageOffset.set(0);
      this.listaDeVeiculos.set([]);
    }

    if (novoTipo === 'dashboard') {
      this.carregarDadosDashboard();
    } else {
      this.buscarDadosDoBackend(false);
    }
  }

  carregarDadosDashboard() {
    this.carregando.set(true);
    const urlCarros = this.getApiUrl('/carro/stats');
    const urlMotos = this.getApiUrl('/moto/stats');

    forkJoin({
      carrosStats: this.http.get<any>(urlCarros),
      motosStats: this.http.get<any>(urlMotos)
    }).subscribe({
      next: ({ carrosStats, motosStats }) => {
        const totalCarrosVal = typeof carrosStats?.total === 'number' ? carrosStats.total : (Array.isArray(carrosStats) ? carrosStats.length : 0);
        const totalMotosVal = typeof motosStats?.total === 'number' ? motosStats.total : (Array.isArray(motosStats) ? motosStats.length : 0);
        
        const ativosCarrosVal = typeof carrosStats?.ativos === 'number' ? carrosStats.ativos : (Array.isArray(carrosStats) ? carrosStats.filter((c: any) => c.is_active !== false).length : 0);
        const ativosMotosVal = typeof motosStats?.ativos === 'number' ? motosStats.ativos : (Array.isArray(motosStats) ? motosStats.filter((m: any) => m.is_active !== false).length : 0);

        this.totalCarros.set(totalCarrosVal);
        this.totalMotos.set(totalMotosVal);
        this.totalVeiculos.set(totalCarrosVal + totalMotosVal);
        this.carrosAtivos.set(ativosCarrosVal);
        this.motosAtivas.set(ativosMotosVal);

        this.porTipoCarros.set(carrosStats?.por_tipo || {});
        this.porTipoMotos.set(motosStats?.por_tipo || {});
        this.carregando.set(false);
        this.atualizarGraficosPizza();
      },
      error: (err) => {
        console.error('❌ Erro ao carregar dados do dashboard:', err);
        this.totalCarros.set(0);
        this.totalMotos.set(0);
        this.totalVeiculos.set(0);
        this.carrosAtivos.set(0);
        this.motosAtivas.set(0);
        this.carregando.set(false);
      }
    });
  }

  ngAfterViewInit() {
    this.atualizarGraficosPizza();
    this.ouvirTransicaoSidebar();
  }

  private ouvirTransicaoSidebar() {
    if (typeof window !== 'undefined') {
      const recalcularTabela = (e: Event) => {
        const transEvt = e as TransitionEvent;
        if (transEvt.propertyName === 'width' || transEvt.propertyName === 'all') {
          window.dispatchEvent(new Event('resize'));
        }
      };

      const sidebarEl = document.querySelector('.sidebar');
      const mainEl = document.querySelector('.main-content');
      sidebarEl?.addEventListener('transitionend', recalcularTabela);
      mainEl?.addEventListener('transitionend', recalcularTabela);
    }
  }

  selecionarTipoVeiculo(tipo: 'dashboard' | 'carro' | 'moto') {
    if (this.tipoVeiculo() === tipo && this.router.url.includes(`/${tipo}`)) return;
    this.router.navigate([`/${tipo}`]);
  }

  onFiltroChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as 'todos' | 'ativo' | 'inativo';
    this.filtroStatus.set(value);
    this.pageOffset.set(0);
    this.buscarDadosDoBackend(false);
  }

  onFiltroTipoChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.filtroTipo.set(value);
    this.pageOffset.set(0);
    this.buscarDadosDoBackend(false);
  }

  onPageSizeChange(event: Event) {
    const size = Number((event.target as HTMLSelectElement).value);
    this.pageSize.set(size);
    this.pageOffset.set(0);
    this.buscarDadosDoBackend(false);
  }

  onPageChange(event: any) {
    if (event && event.offset !== undefined) {
      this.pageOffset.set(event.offset);
      this.buscarDadosDoBackend(false);
    }
  }

  carregarMais() {
    this.pageOffset.update(p => p + 1);
    this.buscarDadosDoBackend(true);
  }

  alternarModoInfinito() {
    this.modoInfinito.update(m => !m);
    this.pageOffset.set(0);
    this.buscarDadosDoBackend(false);
  }

  buscarDadosDoBackend(acumular: boolean = false) {
    const tipo = this.tipoVeiculo();
    if (tipo === 'dashboard') return;

    const endpoint = tipo === 'carro' ? '/carro/carros' : '/moto/motos';
    const baseUrl = this.getApiUrl(endpoint);

    const skip = this.pageOffset() * this.pageSize();
    const limit = this.pageSize();
    const status = this.filtroStatus();
    const filtroTipoVal = this.filtroTipo();

    const params: string[] = [
      `skip=${skip}`,
      `limit=${limit}`
    ];

    if (status === 'ativo') {
      params.push('is_active=true');
    } else if (status === 'inativo') {
      params.push('is_active=false');
    }

    if (filtroTipoVal !== 'todos') {
      params.push(`tipo=${encodeURIComponent(filtroTipoVal)}`);
    }

    const url = `${baseUrl}?${params.join('&')}`;
    console.log(`Iniciando requisição paginada (${acumular ? 'acumular' : 'nova'}) para ${url} ...`);
    this.carregando.set(true);

    this.http.get<any>(url).subscribe({
      next: (resposta) => {
        let rawItems: any[] = [];
        let totalCount = 0;

        if (Array.isArray(resposta)) {
          rawItems = resposta;
          totalCount = resposta.length;
        } else {
          rawItems = resposta.items || [];
          totalCount = resposta.total || rawItems.length;
        }

        console.log(`✅ Resposta do Backend (${tipo}): Total=${totalCount}, Retornados=${rawItems.length}`);

        const regexExtractYear = /\b(19\d\d|20\d\d)\b/;

        let dadosFormatados = rawItems.map(item => {
          let anoExtraido: string | number | null = item.ano ?? item.year ?? null;

          if (!anoExtraido && item.description) {
            const match = String(item.description).match(regexExtractYear);
            if (match) {
              anoExtraido = match[1];
            }
          }

          if (!anoExtraido && item.id !== undefined && item.id !== null) {
            const localAno = localStorage.getItem(`${tipo}_ano_${item.id}`);
            if (localAno) {
              anoExtraido = localAno;
            }
          }

          let rawDesc = String(item.description || item.marca || '');
          let marcaLimpa = rawDesc;

          if (anoExtraido) {
            const strAno = String(anoExtraido);
            marcaLimpa = marcaLimpa
              .replace(`(${strAno})`, '')
              .replace(`Ano ${strAno}`, '')
              .trim();
          }

          if (!marcaLimpa || marcaLimpa === '') {
            marcaLimpa = '-';
          }

          const nameVal = item.title || item.nome || 'Sem Nome';

          return {
            ...item,
            title: nameVal,
            nome: nameVal,
            description: marcaLimpa,
            marca: marcaLimpa,
            ano: anoExtraido ? String(anoExtraido) : '-',
            tipo: item.tipo || 'Outro'
          };
        });

        this.totalRegistros.set(totalCount);

        if (acumular) {
          this.listaDeVeiculos.update(old => [...old, ...dadosFormatados]);
        } else {
          this.listaDeVeiculos.set(dadosFormatados);
        }

        this.carregando.set(false);
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('resize'));
          }
        }, 50);
      },
      error: (erro) => {
        console.error(`❌ Erro ao buscar ${tipo}s:`, erro);
        this.carregando.set(false);
      }
    });
  }

  atualizarGraficosPizza(tentativas = 0) {
    if (this.tipoVeiculo() !== 'dashboard') return;

    setTimeout(() => {
      const okCarros = this.renderizarGraficoDoObjeto(
        this.graficoCarrosCanvas,
        this.porTipoCarros(),
        'Quantidade de Carros',
        ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b', '#14b8a6'],
        (chart) => { this.chartCarrosInstance = chart; }
      );

      const okMotos = this.renderizarGraficoDoObjeto(
        this.graficoMotosCanvas,
        this.porTipoMotos(),
        'Quantidade de Motos',
        ['#d97706', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981', '#06b6d4', '#64748b'],
        (chart) => { this.chartMotosInstance = chart; }
      );

      if ((!okCarros || !okMotos) && tentativas < 10) {
        this.atualizarGraficosPizza(tentativas + 1);
      }
    }, 50);
  }

  private renderizarGraficoDoObjeto(
    canvasRef: ElementRef<HTMLCanvasElement> | undefined,
    contagemPorTipo: { [key: string]: number },
    datasetLabel: string,
    paletaCores: string[],
    setInstance: (chart: Chart | null) => void
  ): boolean {
    if (!canvasRef || !canvasRef.nativeElement) return false;

    const canvasEl = canvasRef.nativeElement;
    const labels = Object.keys(contagemPorTipo);
    const data = Object.values(contagemPorTipo);

    if (labels.length === 0) {
      const existing = Chart.getChart(canvasEl);
      if (existing) {
        existing.destroy();
      }
      setInstance(null);
      return true;
    }

    const backgroundColor = labels.map((_, index) => paletaCores[index % paletaCores.length]);
    const existingChart = Chart.getChart(canvasEl);

    if (existingChart) {
      existingChart.data.labels = labels;
      existingChart.data.datasets[0].data = data;
      existingChart.data.datasets[0].backgroundColor = backgroundColor;
      existingChart.update();
      setInstance(existingChart);
    } else {
      const ctx = canvasEl.getContext('2d');
      if (!ctx) return false;

      const newChart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            label: datasetLabel,
            data: data,
            backgroundColor: backgroundColor,
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                font: { size: 13, weight: 'bold' },
                padding: 14
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = Number(context.raw) || 0;
                  const total = data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                  return ` ${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
      setInstance(newChart);
    }
    return true;
  }

  // --- MODAL DE FORMULÁRIO (CRIAR / EDITAR) ---

  abrirModalCriar() {
    this.modalFormModo.set('criar');
    this.veiculoEmEdicaoId.set(null);
    this.formNome.set('');
    this.formDescricao.set('');
    this.formAno.set(null);
    this.formTipo.set(this.tipoVeiculo() === 'carro' ? 'Sedan' : 'Street');
    this.modalFormAberto.set(true);
  }

  abrirModalEditar(item: any) {
    if (!item.id && item.id !== 0) return;
    this.modalFormModo.set('editar');
    this.veiculoEmEdicaoId.set(item.id);
    this.formNome.set(item.nome || item.title || '');
    let desc = item.marca || item.description || '';
    if (desc === '-') desc = '';
    this.formDescricao.set(desc);
    this.formAno.set(item.ano !== '-' && item.ano ? Number(item.ano) : null);
    this.formTipo.set(item.tipo || (this.tipoVeiculo() === 'carro' ? 'Sedan' : 'Street'));
    this.modalFormAberto.set(true);
  }

  fecharModalForm() {
    this.modalFormAberto.set(false);
  }

  salvarVeiculo() {
    const title = this.formNome().trim();
    const description = this.formDescricao().trim();
    const anoVal = this.formAno();
    const ano = (anoVal !== null && anoVal !== undefined && anoVal !== ('' as any)) ? Number(anoVal) : null;
    const tipo = this.tipoVeiculo();
    const nomeTipo = tipo === 'carro' ? 'Carro' : 'Moto';

    if (!title) {
      this.exibirAlerta('Aviso', `Por favor, digite o Nome do(a) ${nomeTipo.toLowerCase()}.`, 'info');
      return;
    }

    let finalDescription = description;
    if (ano) {
      if (description) {
        if (!description.includes(String(ano))) {
          finalDescription = `${description} (${ano})`;
        }
      } else {
        finalDescription = `Ano ${ano}`;
      }
    }

    const endpointBase = this.getApiUrl(tipo === 'carro' ? '/carro/' : '/moto/');

    if (this.modalFormModo() === 'criar') {
      const body: any = {
        title,
        description: finalDescription,
        tipo: this.formTipo(),
        done: false
      };
      if (ano !== null && !isNaN(ano)) {
        body.ano = ano;
        body.year = ano;
      }

      this.http.post<any>(endpointBase, body).subscribe({
        next: (res) => {
          console.log(`✅ ${nomeTipo} criado(a):`, res);
          if (res && (res.id !== undefined && res.id !== null) && ano) {
            localStorage.setItem(`${tipo}_ano_${res.id}`, String(ano));
          }
          this.fecharModalForm();
          this.exibirAlerta('Sucesso', `${nomeTipo} "${title}" criado(a) com sucesso!`, 'sucesso');
          this.buscarDadosDoBackend(false);
        },
        error: (err) => {
          console.error(`❌ Erro ao criar ${tipo}:`, err);
          this.exibirAlerta('Erro', `Erro ao criar ${tipo} no servidor.`, 'erro');
        }
      });
    } else {
      const id = this.veiculoEmEdicaoId();
      if (id === null) return;

      const body: any = {
        id,
        title,
        description: finalDescription,
        tipo: this.formTipo(),
        done: false
      };
      if (ano !== null && !isNaN(ano)) {
        body.ano = ano;
        body.year = ano;
      }

      this.http.put(`${endpointBase}${id}`, body).subscribe({
        next: (res) => {
          console.log(`✅ ${nomeTipo} atualizado(a):`, res);
          if (ano) {
            localStorage.setItem(`${tipo}_ano_${id}`, String(ano));
          }
          this.fecharModalForm();
          this.exibirAlerta('Sucesso', `${nomeTipo} #${id} atualizado(a) com sucesso!`, 'sucesso');
          this.buscarDadosDoBackend(false);
        },
        error: (err) => {
          console.error(`❌ Erro ao atualizar ${tipo}:`, err);
          this.exibirAlerta('Erro', `Erro ao atualizar ${tipo} no servidor.`, 'erro');
        }
      });
    }
  }

  // --- CONFIRMAÇÃO E ALERTAS VIA SWEETALERT2 ---

  deletarVeiculo(item: any) {
    if (!item.id && item.id !== 0) return;
    const tipo = this.tipoVeiculo();
    const artigoNome = tipo === 'carro' ? 'o carro' : 'a moto';
    const nomeItem = item.nome || item.title || `#${item.id}`;

    Swal.fire({
      title: 'Tem certeza?',
      text: `Deseja realmente deletar ${artigoNome} "${nomeItem}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sim, deletar!',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        if (this.filtroStatus() === 'ativo') {
          this.listaDeVeiculos.update(lista => lista.filter(v => v.id !== item.id));
        }

        const endpointBase = this.getApiUrl(tipo === 'carro' ? '/carro/' : '/moto/');

        this.http.delete(`${endpointBase}${item.id}`).subscribe({
          next: () => {
            console.log(`✅ Item #${item.id} deletado com sucesso no backend.`);
            this.exibirAlerta('Sucesso', `Deletado(a) com sucesso!`, 'sucesso');
            this.buscarDadosDoBackend(false);
          },
          error: (err) => {
            console.error(`❌ Erro ao deletar ${tipo} no servidor:`, err);
            this.exibirAlerta('Erro', `Erro ao deletar no servidor.`, 'erro');
            this.buscarDadosDoBackend(false);
          }
        });
      }
    });
  }

  // --- RESTAURAR VEÍCULO ---

  restaurarVeiculo(item: any) {
    if (!item.id && item.id !== 0) return;
    const tipo = this.tipoVeiculo();
    const nomeTipo = tipo === 'carro' ? 'Carro' : 'Moto';
    const nomeItem = item.nome || item.title || `#${item.id}`;
    const endpointBase = this.getApiUrl(tipo === 'carro' ? '/carro/' : '/moto/');

    this.http.patch(`${endpointBase}${item.id}/restore`, {}).subscribe({
      next: () => {
        console.log(`✅ Item #${item.id} restaurado no backend.`);
        this.exibirAlerta('Sucesso', `${nomeTipo} "${nomeItem}" restaurado(a) com sucesso!`, 'sucesso');
        this.buscarDadosDoBackend(false);
      },
      error: (err) => {
        console.error(`❌ Erro ao restaurar ${tipo}:`, err);
        this.exibirAlerta('Erro', `Erro ao restaurar no servidor.`, 'erro');
      }
    });
  }

  // --- SWEETALERT2 DISPARADOR ---

  exibirAlerta(titulo: string, mensagem: string, tipo: 'sucesso' | 'erro' | 'info' = 'info') {
    let iconType: 'success' | 'error' | 'warning' | 'info' = 'info';
    if (tipo === 'sucesso') iconType = 'success';
    if (tipo === 'erro') iconType = 'error';

    Swal.fire({
      title: titulo,
      text: mensagem,
      icon: iconType,
      confirmButtonText: 'OK',
      confirmButtonColor: tipo === 'sucesso' ? '#198754' : tipo === 'erro' ? '#dc3545' : '#0d6efd'
    });
  }
}
