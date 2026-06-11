import torch
import torch.nn as nn

def generate_fgsm_attack(model, loss_fn, inputs, targets, epsilon=0.01):
    """
    Generates adversarial examples using Fast Gradient Sign Method (FGSM).
    inputs: original PyTorch tensor with requires_grad=True
    targets: original targets
    epsilon: perturbation magnitude
    """
    if inputs.grad is not None:
        inputs.grad.zero_()
        
    inputs.requires_grad = True
    outputs = model(inputs)
    
    # Handle both binary classification (N, 1) and cross-entropy (N, C)
    if outputs.shape == targets.shape:
        loss = loss_fn(outputs, targets)
    else:
        # e.g., if outputs is squeezed but targets is not
        loss = loss_fn(outputs.squeeze(-1), targets.view(-1))
        
    model.zero_grad()
    loss.backward()
    
    data_grad = inputs.grad.data
    perturbed_data = inputs + epsilon * data_grad.sign()
    
    # Detach to avoid interfering with next backward pass
    perturbed_data = perturbed_data.detach()
    return perturbed_data
