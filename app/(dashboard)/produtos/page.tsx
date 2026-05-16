"use client";

import { useState, useEffect } from "react";
import { getProdutos, addProduto, deleteProduto } from "@/app/actions/produtos";
import { ShoppingBag, Plus, Trash2, Tag, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Produto {
  id: string;
  nome_produto: string;
  tipo: "front" | "upsell";
  ativo: boolean;
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"front" | "upsell">("front");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchProdutos = async () => {
    setLoading(true);
    const result = await getProdutos();
    if (result.success) {
      setProdutos(result.data || []);
    } else {
      console.error("Erro ao carregar produtos:", result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  const handleAddProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome) return;

    setSaving(true);
    const result = await addProduto(novoNome, novoTipo);

    if (!result.success) {
      setMessage({ type: "error", text: "Erro ao adicionar produto: " + result.error });
    } else {
      setMessage({ type: "success", text: "Produto adicionado com sucesso!" });
      setNovoNome("");
      fetchProdutos();
    }
    setSaving(false);

    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteProduto = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    const result = await deleteProduto(id);

    if (!result.success) {
      setMessage({ type: "error", text: "Erro ao excluir: " + result.error });
    } else {
      fetchProdutos();
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase">
          Gestão de Produtos
        </h1>
        <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">
          Cadastre seus produtos para filtrar os dados no Dashboard
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-card border border-border rounded-3xl p-8 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        
        <form onSubmit={handleAddProduto} className="relative z-10 flex flex-col md:flex-row items-end gap-6">
          <div className="flex-1 space-y-3">
            <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest px-1">Nome do Produto</label>
            <div className="relative group">
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Produto Principal"
                className="w-full h-14 bg-background border border-border rounded-2xl px-5 text-base font-bold text-foreground outline-none focus:border-primary transition-all"
              />
              <Tag className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            </div>
          </div>

          <div className="w-full md:w-56 space-y-3">
            <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest px-1">Tipo</label>
            <select
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value as any)}
              className="w-full h-14 bg-background border border-border rounded-2xl px-5 text-base font-bold text-foreground outline-none focus:border-primary transition-all cursor-pointer appearance-none"
            >
              <option value="front" className="bg-card text-foreground">Front-end</option>
              <option value="upsell" className="bg-card text-foreground">Upsell</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving || !novoNome}
            className="w-full md:w-auto h-14 px-10 bg-primary text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${
            message.type === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
          }`}>
            {message.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-xs font-bold uppercase tracking-wide">{message.text}</span>
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] px-2">Produtos Cadastrados</h2>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : produtos.length === 0 ? (
          <div className="bg-card/30 border border-dashed border-border rounded-3xl py-12 flex flex-col items-center gap-3">
            <ShoppingBag className="w-10 h-10 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">Nenhum produto cadastrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {produtos.map((produto) => (
              <div
                key={produto.id}
                className="bg-card border border-border rounded-2xl p-6 flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-background border border-border flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base uppercase tracking-tight">{produto.nome_produto}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                      produto.tipo === "front" ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                    }`}>
                      {produto.tipo}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteProduto(produto.id)}
                  className="p-3 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
