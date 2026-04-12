import React, { useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    Handle,
    Position,
    Connection,
    Edge,
    Node,
    Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Hammer, X, Play, Save, Trash2, Cpu, Zap, Activity, AlertTriangle } from 'lucide-react';
import Button from '@/components/common/Button';

// --- Custom Nodes ---

// Trigger Node
const TriggerNode = ({ data, isConnectable }: any) => {
    return (
        <div className="bg-slate-900 border-2 border-blue-500 rounded-xl p-4 shadow-[0_0_20px_rgba(59,130,246,0.3)] min-w-[250px]">
            <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                <Activity size={16} className="text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Trigger</span>
            </div>

            <div className="space-y-3">
                <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Indicator</label>
                    <select
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                        onChange={(evt) => data.onChange?.('indicator', evt.target.value)}
                        defaultValue={data.indicator || 'RSI'}
                    >
                        <option value="RSI">RSI</option>
                        <option value="MACD">MACD</option>
                        <option value="SMA">SMA</option>
                        <option value="EMA">EMA</option>
                        <option value="Bollinger">Bollinger Bands</option>
                    </select>
                </div>

                <div className="flex gap-2">
                    <div className="w-1/3">
                        <label className="text-[10px] text-gray-500 uppercase block mb-1">Op</label>
                        <select
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                            onChange={(evt) => data.onChange?.('operator', evt.target.value)}
                            defaultValue={data.operator || '<'}
                        >
                            <option value="<">&lt;</option>
                            <option value=">">&gt;</option>
                            <option value="=">=</option>
                            <option value="crossing_up">Cross Up</option>
                            <option value="crossing_down">Cross Down</option>
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] text-gray-500 uppercase block mb-1">Value</label>
                        <input
                            type="number"
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                            placeholder="30"
                            onChange={(evt) => data.onChange?.('value', evt.target.value)}
                            defaultValue={data.value || 30}
                        />
                    </div>
                </div>
            </div>

            <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-blue-500 !w-3 !h-3" />
        </div>
    );
};

// Action Node
const ActionNode = ({ data, isConnectable }: any) => {
    return (
        <div className="bg-slate-900 border-2 border-pink-500 rounded-xl p-4 shadow-[0_0_20px_rgba(236,72,153,0.3)] min-w-[250px]">
            <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-pink-500 !w-3 !h-3" />

            <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                <Zap size={16} className="text-pink-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-pink-400">Action</span>
            </div>

            <div className="space-y-3">
                <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Execute</label>
                    <select
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-pink-500 outline-none"
                        onChange={(evt) => data.onChange?.('action', evt.target.value)}
                        defaultValue={data.action || 'BUY'}
                    >
                        <option value="BUY">Long / Buy</option>
                        <option value="SELL">Short / Sell</option>
                        <option value="CLOSE">Close Position</option>
                    </select>
                </div>

                <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Amount (% Balance)</label>
                    <input
                        type="number"
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-pink-500 outline-none"
                        placeholder="100"
                        max="100"
                        min="1"
                        onChange={(evt) => data.onChange?.('amount', evt.target.value)}
                        defaultValue={data.amount || 100}
                    />
                </div>
            </div>
        </div>
    );
};

const nodeTypes = {
    trigger: TriggerNode,
    action: ActionNode,
};

// --- Main Builder Component ---

interface VisualStrategyBuilderModalProps {
    onClose: () => void;
    onSave: (name: string, config: any) => void;
}

const VisualStrategyBuilderModal: React.FC<VisualStrategyBuilderModalProps> = ({ onClose, onSave }) => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const [name, setName] = useState('');
    const [isCompiling, setIsCompiling] = useState(false);

    const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#fff', strokeWidth: 2 } }, eds)), [setEdges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            // check if the dropped element is valid
            if (typeof type === 'undefined' || !type) {
                return;
            }

            if (reactFlowInstance && reactFlowWrapper.current) {
                const position = reactFlowInstance.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                });

                const newNode: Node = {
                    id: `${type}_${Date.now()}`,
                    type,
                    position,
                    data: {
                        label: `${type} node`,
                        indicator: 'RSI', operator: '<', value: 30, // defaults
                        action: 'BUY', amount: 100, // defaults
                        onChange: (field: string, val: any) => {
                            setNodes((nds) =>
                                nds.map((node) => {
                                    if (node.id === newNode.id) {
                                        node.data = { ...node.data, [field]: val };
                                    }
                                    return node;
                                })
                            );
                        }
                    },
                };

                setNodes((nds) => nds.concat(newNode));
            }
        },
        [reactFlowInstance, setNodes]
    );

    // Need to update onChange handlers for existing nodes if they are loaded back, 
    // but for fresh start it's fine. For robustness we can wrap nodeTypes with a component 
    // that uses a context or similar, but for now simple data update is fine.
    // Actually, the closure in onDrop `newNode` `onChange` refers to `newNode.id` which is static for that node. 
    // However, `setNodes` inside it might be stale if not careful. 
    // Better approach: The custom node component calls `data.onChange` which we define here.
    // We need to ensure `data.onChange` updates the state correctly.

    // To handle updates properly for all nodes (even those not just dropped), 
    // we should probably just pass a generic update function or rely on the nodes updating their own local state?
    // No, ReactFlow state should be source of truth.
    // Let's refine the onChange injection.
    // Actually, simpler: define a global `updateNodeData` function.

    const updateNodeData = (nodeId: string, field: string, value: any) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            [field]: value,
                        },
                    };
                }
                return node;
            })
        );
    };

    // Enhance nodes with the updater on render or whenever nodes change?
    // Or just pass the id and the updater to the node via data.
    // We can't easily re-inject into `data` on every render without causing re-renders.
    // We will patch the `onDrop` to include the ID specific updater, 
    // and we should probably use `useEffect` to patch loaded nodes if we were loading.

    // Revised onDrop logic below to include correct updater.

    const handleCompile = () => {
        if (!name) {
            alert("Please name your strategy");
            return;
        }
        setIsCompiling(true);

        // Basic validation and compilation
        // 1. Find all Trigger nodes
        // 2. Find their connected Action nodes

        const config = {
            triggers: [] as any[],
            actions: [] as any[],
            logic_map: [] as any[]
        };

        const triggerNodes = nodes.filter(n => n.type === 'trigger');
        const actionNodes = nodes.filter(n => n.type === 'action');

        if (triggerNodes.length === 0 || actionNodes.length === 0) {
            alert("Invalid Strategy: Must have at least one Trigger and one Action.");
            setIsCompiling(false);
            return;
        }

        // Build the mapping
        triggerNodes.forEach(tNode => {
            config.triggers.push({
                id: tNode.id,
                type: 'technical_indicator',
                params: {
                    indicator: tNode.data.indicator,
                    operator: tNode.data.operator,
                    value: tNode.data.value
                }
            });

            // Find connected edges
            const connectedEdges = edges.filter(e => e.source === tNode.id);
            connectedEdges.forEach(edge => {
                const targetNode = nodes.find(n => n.id === edge.target);
                if (targetNode && targetNode.type === 'action') {
                    config.logic_map.push({
                        trigger_id: tNode.id,
                        action_id: targetNode.id
                    });
                }
            });
        });

        actionNodes.forEach(aNode => {
            config.actions.push({
                id: aNode.id,
                type: 'trade_execution',
                params: {
                    action: aNode.data.action,
                    amount_percent: aNode.data.amount
                }
            });
        });

        setTimeout(() => {
            // Simulate compile time
            console.log("Compiled Config:", config);
            onSave(name, config);
            setIsCompiling(false);
        }, 1000);
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 w-full h-full max-w-7xl rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/40">
                    <div className="flex items-center gap-4">
                        <div className="bg-violet-500/20 p-2 rounded-lg text-violet-400">
                            <Hammer size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-wide">Visual Logic Architect</h2>
                            <p className="text-[10px] text-gray-500 font-mono">REACTFLOW ENGINE v11.0</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="text"
                            placeholder="Strategy Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-violet-500 outline-none w-64"
                        />
                        <Button variant="secondary" onClick={onClose} className="border-white/10 hover:bg-white/10 text-gray-400 hover:text-white">Cancel</Button>
                        <Button onClick={handleCompile} className="bg-violet-600 hover:bg-violet-500 text-white border-0 flex items-center gap-2">
                            {isCompiling ? <Activity className="animate-spin" size={16} /> : <Zap size={16} />}
                            {isCompiling ? 'Compiling...' : 'Compile & Deploy'}
                        </Button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-black/20 border-r border-white/5 p-4 flex flex-col gap-6 overflow-y-auto z-10">
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Logic Modules</h3>
                            <p className="text-xs text-gray-600 mb-4">Drag these nodes onto the canvas to build your strategy.</p>

                            <div className="space-y-4">
                                <div
                                    className="bg-slate-800 border-2 border-blue-500/50 p-3 rounded-lg cursor-grab hover:border-blue-500 hover:bg-blue-500/10 transition-colors flex items-center gap-3"
                                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', 'trigger')}
                                    draggable
                                >
                                    <div className="bg-blue-500/20 p-2 rounded text-blue-400"><Activity size={16} /></div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-200">Trigger</p>
                                        <p className="text-[10px] text-gray-500">Signal Condition</p>
                                    </div>
                                </div>

                                <div
                                    className="bg-slate-800 border-2 border-pink-500/50 p-3 rounded-lg cursor-grab hover:border-pink-500 hover:bg-pink-500/10 transition-colors flex items-center gap-3"
                                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', 'action')}
                                    draggable
                                >
                                    <div className="bg-pink-500/20 p-2 rounded text-pink-400"><Zap size={16} /></div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-200">Action</p>
                                        <p className="text-[10px] text-gray-500">Execute Order</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-200/70 leading-relaxed">
                                    Tip: Connect a <b>Trigger</b> output to an <b>Action</b> input to form a valid logic verification chain.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 bg-[#050510] relative h-full" ref={reactFlowWrapper}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onInit={setReactFlowInstance}
                            onDrop={(e) => {
                                // Re-implementing onDrop here to ensure it uses the latest setNodes
                                e.preventDefault();
                                const type = e.dataTransfer.getData('application/reactflow');
                                if (!type || !reactFlowInstance) return;

                                const position = reactFlowInstance.screenToFlowPosition({
                                    x: e.clientX,
                                    y: e.clientY,
                                });

                                const id = `${type}_${Date.now()}`;
                                const newNode: Node = {
                                    id,
                                    type,
                                    position,
                                    data: {
                                        label: `${type} node`,
                                        indicator: 'RSI', operator: '<', value: 30,
                                        action: 'BUY', amount: 100,
                                        onChange: (field: string, val: any) => updateNodeData(id, field, val)
                                    },
                                };

                                setNodes((nds) => nds.concat(newNode));
                            }}
                            onDragOver={onDragOver}
                            nodeTypes={nodeTypes}
                            fitView
                        >
                            <Background color="#334155" gap={20} size={1} />
                            <Controls className="bg-slate-800 border border-white/10 text-white fill-white" />
                            <Panel position="bottom-center" className="bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-xs text-gray-400 mb-8">
                                {nodes.length} Modules Active • {edges.length} Connections
                            </Panel>
                        </ReactFlow>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default function VisualStrategyBuilderWrapper(props: VisualStrategyBuilderModalProps) {
    return (
        <ReactFlowProvider>
            <VisualStrategyBuilderModal {...props} />
        </ReactFlowProvider>
    );
}
